# Download System Plan — llama-studio

## Scope

This plan covers three foundational priorities for making downloads reliable, observable, and safe:

1. **DownloadManager** — one unified primitive in main process (queue, persistence, events)
2. **Resumable + verified downloads** — resume from partial, hash-verify, atomic finalize
3. **Downloads drawer** — persistent observability surface accessible from anywhere

These are the load-bearing pieces everything else (model library, binary install, registry) plugs into.

---

## Current state

- `BinariesService` (`src/core/binaries/`) implements its own HTTP download inline — no resume, no hash-verify, no queue.
- `RegistryService` delegates to `window.electron` IPC for downloads — implementation unclear/missing.
- No persistent download state — progress is ephemeral; a crash loses it.
- No observability surface — progress shows only in the page that triggered the download.
- `src/main/db.ts` already runs migrations on boot — safe to extend with a `downloads` table.

---

## Priority 1: DownloadManager

### Architecture decision

**Single service in main process.** Neither BinariesService nor RegistryService implement download logic directly. Both submit jobs to DownloadManager. This is the only way to:
- Share one queue across the app
- Persist state that survives renderer reload and app restart
- Stream progress to any renderer window (not just the one that initiated the download)

### File layout

```
src/main/downloads/
  DownloadManager.ts    ← the singleton service
  download-utils.ts     ← http helpers (HEAD, Range, streaming hash)
  verifiers.ts          ← GGUF magic check, SHA256 verify, zip extract
src/main/ipc/
  downloads.ts          ← IPC handler registration
src/renderer/lib/stores/
  downloads.ts          ← Zustand store (subscribes to IPC events)
src/renderer/components/
  DownloadsDrawer.tsx   ← persistent UI surface
  ui/progress-card.tsx  ← reusable download card (also used in onboarding)
```

### SQLite schema (add to `src/main/db.ts` migrations)

```sql
CREATE TABLE IF NOT EXISTS downloads (
  id              TEXT PRIMARY KEY,
  kind            TEXT NOT NULL,           -- 'binary' | 'model'
  display_name    TEXT NOT NULL,
  url             TEXT NOT NULL,
  target_path     TEXT NOT NULL,           -- final path after atomic rename
  part_path       TEXT NOT NULL,           -- <target>.part during download
  meta_path       TEXT NOT NULL,           -- <target>.part.json sidecar
  bytes_total     INTEGER,                 -- null until HEAD responds
  bytes_done      INTEGER NOT NULL DEFAULT 0,
  state           TEXT NOT NULL DEFAULT 'queued',
  error_message   TEXT,
  attempts        INTEGER NOT NULL DEFAULT 0,
  max_attempts    INTEGER NOT NULL DEFAULT 5,
  sha256_expected TEXT,                    -- null = unverified warning shown
  sha256_actual   TEXT,
  etag            TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);
```

### DownloadJob type

```typescript
// src/main/downloads/DownloadManager.ts

type DownloadState =
  | 'queued'
  | 'downloading'
  | 'verifying'
  | 'extracting'   // binaries only: unzip
  | 'done'
  | 'failed'
  | 'cancelled'
  | 'paused'

interface DownloadJob {
  id: string
  kind: 'binary' | 'model'
  displayName: string
  url: string
  targetPath: string
  partPath: string
  metaPath: string
  bytesTotal: number | null
  bytesDone: number
  state: DownloadState
  errorMessage: string | null
  attempts: number
  maxAttempts: number
  sha256Expected: string | null
  sha256Actual: string | null
  etag: string | null
  createdAt: string
  updatedAt: string
}
```

### DownloadManager API surface

```typescript
class DownloadManager {
  // Lifecycle
  static getInstance(): DownloadManager
  init(db: Database, webContents: Electron.WebContents[]): void
  
  // Job management
  enqueue(spec: EnqueueSpec): Promise<string>   // returns id
  cancel(id: string): Promise<void>
  pause(id: string): Promise<void>
  resume(id: string): Promise<void>
  remove(id: string): Promise<void>             // done/failed/cancelled only
  clearFinished(): Promise<void>
  
  // Queries
  list(): DownloadJob[]
  get(id: string): DownloadJob | null
  getActive(): DownloadJob[]
}

interface EnqueueSpec {
  kind: 'binary' | 'model'
  displayName: string
  url: string
  targetPath: string
  sha256Expected?: string      // from HF LFS pointer or release manifest
  extractZip?: boolean         // true for binary releases
  maxConcurrent?: number       // override global limit for this job
}
```

### Concurrency and queue behavior

- Max 2 concurrent downloads globally (configurable in settings later)
- Queue is FIFO; new jobs go to back unless `priority` flag set
- On app restart: reload all `queued` and `paused` jobs; offer resume prompt via notification
- `cancelled` and `failed` jobs remain in DB for 7 days (for display in drawer history)

---

## Priority 2: Resumable + Verified Downloads

### The download loop (happy + failure paths)

```
enqueue(spec)
  │
  ▼
[queued] → pick up by runner
  │
  ▼
HEAD <url>
  ├─ 4xx permanent → fail immediately (no retry)
  └─ ok → read Content-Length, ETag, Accept-Ranges
  │
  ▼
Read .part.json if exists
  ├─ etag matches AND bytesDone > 0 → RANGE request from bytesDone
  └─ no match / no part → full GET from 0, reset bytesDone
  │
  ▼
[downloading] — stream to .part file
  ├─ Update bytesDone every 256 KB chunk
  ├─ Persist to DB every 2s (not every chunk)
  ├─ Emit progress event every 500ms
  ├─ Stall detection: if bytesDone unchanged for 60s → abort, schedule retry
  ├─ Transient error (ECONNRESET, 5xx, 429) → backoff retry
  │   └─ 429: honor Retry-After header
  ├─ Disk full → fail permanently with "Disk full" message
  └─ User cancel → mark cancelled, leave .part for resume
  │
  ▼ (stream complete, bytesDone === bytesTotal)
[verifying]
  ├─ sha256Expected set → verify, mismatch → delete .part, retry full (corrupt server file)
  ├─ sha256Expected null → skip verify, mark 'unverified' in display_name suffix
  └─ GGUF kind: read magic bytes (must be 0x47 0x47 0x55 0x46)
      └─ fail if not GGUF
  │
  ▼ (binary kind only)
[extracting]
  ├─ Unzip to <targetDir>.tmp/
  ├─ Move executable to targetPath
  └─ Cleanup .tmp/
  │
  ▼
[done]
  ├─ fs.rename(.part → targetPath)  ← atomic
  ├─ fs.unlink(.part.json)
  ├─ Update DB state
  └─ Emit 'download:complete' event
```

### Backoff schedule

| Attempt | Wait before retry |
|---------|------------------|
| 1       | 1s               |
| 2       | 2s               |
| 3       | 4s               |
| 4       | 8s               |
| 5       | 16s              |
| 6+      | fail permanently |

### SHA256 sourcing

| Source       | How to get SHA256                                          |
|--------------|-----------------------------------------------------------|
| HF model     | `GET /api/models/{repo}/tree/{branch}` → LFS sha256 field |
| GH release   | Parse `SHA256SUMS` asset if present in release assets     |
| GH release   | Fall back: store in app's own binary manifest JSON        |
| Unknown      | `sha256Expected = null` → show "Unverified" badge in UI   |

### Pre-flight checks (run BEFORE enqueue)

These happen in a `preflightCheck(spec): PreflightResult` function called from the UI confirm dialog, not inside DownloadManager itself (separation of concerns).

```typescript
interface PreflightResult {
  diskOk: boolean
  diskAvailableGB: number
  diskRequiredGB: number
  licenseOk: boolean
  licenseBlocked?: string      // e.g. "LLAMA3 not in Strict tier"
  compatibilityOk: boolean
  compatibilityWarnings: string[]  // e.g. "Needs llama.cpp b4567+"
  vramWarning?: string         // e.g. "14 GB needed, 8 GB detected"
  authorVerified: boolean
  sha256Available: boolean     // false → will be unverified
}
```

---

## Priority 3: Downloads Drawer (UX)

### Design decision: drawer, not page

Downloads are cross-cutting. A user browsing the Registry while a model downloads should not have to leave the page to check progress. The drawer lives *outside* the page routing.

**Never** add "Downloads" to the sidebar nav. Instead:
1. A bottom indicator in the sidebar (below nav items, above settings)
2. Keyboard shortcut: `⌘⇧D` (or `Ctrl+Shift+D` on Windows)
3. Clicking any download-related toast opens the drawer

### Sidebar indicator states

```
─────────────────────
  (no active downloads)   → nothing shown
─────────────────────
  ↓  2 downloading        → animated icon + active count
─────────────────────
  ✓  All done             → checkmark, fades after 3s
─────────────────────
  !  1 failed             → warning icon (persists until user opens drawer)
─────────────────────
```

Implementation: a small `<DownloadIndicator />` component at the bottom of `Sidebar.tsx` that subscribes to `useDownloadsStore`.

### Drawer anatomy

```
┌─────────────────────────────────────────────────────────────┐
│ Downloads                    2 active        [Clear done] ✕ │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  [model]  Llama-3.2-3B-Q4_K_M.gguf                        │
│           ████████████░░░░░░  62%  2.1 / 3.4 GB  8.2 MB/s │
│           ETA ~3 min                   [Pause]  [Cancel]   │
│                                                             │
│  [binary] llama-b4567-cuda-linux-x64.zip                   │
│           ██████░░░░░░░░░░░░  38%  89 / 234 MB  4.1 MB/s  │
│           ETA ~6 min                   [Pause]  [Cancel]   │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  [✓]  Phi-3-mini-Q4_K_M.gguf              Done · 4m ago   │
│       SHA256 verified                  [Use in Launch Pad] │
│                                                             │
│  [✗]  Mistral-7B-Q8_0.gguf           Failed · 3 attempts  │
│       Network reset. No more retries.     [Retry] [Remove] │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### ProgressCard component (`src/renderer/components/ui/progress-card.tsx`)

Props:
```typescript
interface ProgressCardProps {
  job: DownloadJob
  onCancel: () => void
  onPause: () => void
  onResume: () => void
  onRetry: () => void
  onRemove: () => void
  onNavigate?: () => void   // "View in Library" / "Use in Launch Pad"
}
```

Internal state: rolling speed average (last 10 measurements × 500ms = 5s window). ETA = `(bytesTotal - bytesDone) / speedBytesPerSec`.

States and their visible actions:

| State       | Progress bar | Actions                |
|-------------|-------------|------------------------|
| queued      | ghost/empty | Cancel                 |
| downloading | animated    | Pause, Cancel          |
| verifying   | pulsing     | (none — almost done)   |
| extracting  | pulsing     | (none — almost done)   |
| paused      | static      | Resume, Cancel         |
| done        | full green  | Navigate (if applicable)|
| failed      | red         | Retry, Remove          |
| cancelled   | dimmed      | Remove                 |

### Error messaging rules

Never show "Error" alone. Template: `[What happened] · [What the app will do / what user can do]`

Examples:
- "Network connection lost · Retrying in 4s (attempt 2 of 5)"
- "Not enough disk space · 34 GB free, 38 GB needed — free up space and retry"
- "Checksum mismatch · File may be corrupt, restarting download"
- "Server error (503) · Retrying in 16s (attempt 4 of 5)"
- "License blocked · LLAMA3 not allowed in your Strict compliance tier"
- "Not a GGUF file · Download succeeded but file format is invalid"
- "Rate limited (429) · Waiting 60s as requested by Hugging Face"

### Toast strategy

| Event               | Toast content                              | CTA                    |
|---------------------|--------------------------------------------|------------------------|
| Download queued     | "{name} added to queue"                    | "View downloads"       |
| Download complete   | "{name} ready"                             | "Use in Launch" or "View in Library" |
| Download failed     | "{name} failed: {short reason}"            | "View details"         |
| Resume on restart   | "3 downloads were queued. Resume them?"   | "Resume" / "Dismiss"   |

No intermediate progress toasts. The drawer is the progress surface.

### IPC event contract

Main → Renderer events (via `webContents.send`):

```typescript
'download:list'     // initial load: DownloadJob[]
'download:progress' // { id, bytesDone, bytesTotal, state }
'download:state'    // { id, state, errorMessage? }  — state transitions
'download:done'     // { id, targetPath }
```

Renderer → Main (IPC invoke):

```typescript
'download:enqueue'    // EnqueueSpec → string (id)
'download:cancel'     // id → void
'download:pause'      // id → void
'download:resume'     // id → void
'download:remove'     // id → void
'download:clearDone'  // void → void
'download:list'       // void → DownloadJob[]
```

---

## UX decisions — cross-cutting rules

### Confirm dialog before any download

Never silent download. Every download goes through a `DownloadConfirmDialog` that shows:

```
┌──────────────────────────────────────────────────────┐
│ Download Llama-3.2-3B-Instruct-Q4_K_M.gguf          │
├──────────────────────────────────────────────────────┤
│  Size          2.0 GB                                │
│  Author        meta-llama  ✓ Verified                │
│  License       Llama 3.2 Community  ✓ Allowed        │
│  VRAM needed   ~2.5 GB   ✓ 8 GB available            │
│  SHA256        Will be verified after download        │
│  Disk space    ✓ 234 GB free                         │
│                                                      │
│  ⚠ Requires llama.cpp b4500+  (you have b4234)       │
│    Update binary first or this model may not load.  │
├──────────────────────────────────────────────────────┤
│                          [Cancel]  [Download]        │
└──────────────────────────────────────────────────────┘
```

Block download (disable button) only for: license violation, disk full.
Warn but allow: VRAM tight, binary version mismatch, unverified SHA256.

### No optimistic UI for destructive model operations

Deleting a model: confirm with file size shown, then delete, then remove from store. Never tombstone-then-undo for a 5 GB file.

### Progress is always visible

If the drawer is closed and a download is active, the sidebar indicator is the minimum visibility floor. Users should never wonder "is it still downloading?".

### Failure is never terminal without explanation

Every failed state in the drawer shows: what went wrong (specific), how many retries were attempted, and what the user can do next (Retry / check disk / update binary / change license policy).

---

## Integration points — what existing code to change

### `src/main/db.ts`
- Add `downloads` table migration (schema above)
- Add `download_jobs` helper functions: `upsertDownload`, `listDownloads`, `updateDownloadState`

### `src/main/ipc/binaries.ts`
- Remove inline HTTP download code
- Replace with `DownloadManager.getInstance().enqueue({kind: 'binary', ...})`
- Return job `id` instead of result immediately

### `src/main/ipc/registry.ts` (or wherever model download is handled)
- Same: delegate to DownloadManager
- Pass `sha256Expected` from HF LFS pointer API

### `src/renderer/components/Sidebar.tsx`
- Add `<DownloadIndicator />` at bottom of nav (above Settings link)

### `src/renderer/App.tsx`
- Mount `<DownloadsDrawer />` outside `<Outlet />` so it persists across navigation

### `src/renderer/pages/RegistryPage.tsx`
- "Download" button opens `DownloadConfirmDialog` with preflight result
- On confirm: invoke `download:enqueue` IPC, receive job id, show toast

### `src/renderer/pages/BinariesPage.tsx`
- "Install" button routes through same confirm + enqueue pattern
- Progress shown in drawer, not inline in page (simplifies BinariesPage significantly)

---

## Implementation order within this feature

1. **DB migration** — add `downloads` table. (30 min)
2. **`download-utils.ts`** — HEAD, Range-GET with stall detection, streaming SHA256. (2h)
3. **`verifiers.ts`** — GGUF magic-byte check, SHA256 compare, zip extract. (1h)
4. **`DownloadManager.ts`** — singleton, queue, runner loop, event emit. (3h)
5. **`downloads.ts` IPC handlers** — thin wrappers over DownloadManager. (1h)
6. **`useDownloadsStore`** — Zustand store, IPC event subscriptions. (1h)
7. **`progress-card.tsx`** — ProgressCard UI component with speed/ETA. (2h)
8. **`DownloadsDrawer.tsx`** — drawer shell, list of ProgressCards. (1.5h)
9. **`DownloadIndicator.tsx`** — sidebar badge, open/close drawer. (45 min)
10. **Wire into Sidebar and App** — mount drawer, add indicator. (30 min)
11. **`preflightCheck`** — disk, license, VRAM, binary-compat checks. (1.5h)
12. **`DownloadConfirmDialog`** — preflight display, confirm/cancel. (1h)
13. **Migrate BinariesService** — remove inline download, use DownloadManager. (1h)
14. **Migrate RegistryPage** — remove inline download, use DownloadManager + dialog. (1h)
15. **E2E test** — download a small model, kill app mid-download, relaunch, resume. (30 min)

Total estimate: ~18h of focused implementation.

---

## What this unblocks

Once DownloadManager exists:
- **Model library** becomes trivially reliable (all downloads already verified and atomic)
- **Onboarding step 5** (pick a starter model) uses the same dialog + drawer
- **Binary updates** notify via drawer when new llama.cpp is out
- **Diagnostics export** can include download history as part of the support bundle
- **Command palette** can surface "Resume failed downloads" as an action

---

## Files to create (new)

```
src/main/downloads/DownloadManager.ts
src/main/downloads/download-utils.ts
src/main/downloads/verifiers.ts
src/main/ipc/downloads.ts
src/renderer/lib/stores/downloads.ts
src/renderer/components/DownloadsDrawer.tsx
src/renderer/components/DownloadIndicator.tsx
src/renderer/components/DownloadConfirmDialog.tsx
src/renderer/components/ui/progress-card.tsx
```

## Files to modify (existing)

```
src/main/db.ts                          ← add downloads table migration
src/main/ipc/binaries.ts               ← delegate to DownloadManager
src/main/ipc/registry.ts               ← delegate to DownloadManager
src/renderer/App.tsx                   ← mount DownloadsDrawer
src/renderer/components/Sidebar.tsx    ← add DownloadIndicator
src/renderer/pages/RegistryPage.tsx    ← use DownloadConfirmDialog
src/renderer/pages/BinariesPage.tsx    ← use DownloadConfirmDialog
```
