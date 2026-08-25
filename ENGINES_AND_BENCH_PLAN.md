# Engines + Bench Comparison — Design Plan

Status: Part A (Engines page) **shipped 2026-06-13**; Part B (Bench leaderboard)
proposed. Synthesizes the Binaries-page reorg and the new cross-hardware Bench
page into one coherent model.

## 1. The model (shared vocabulary)

The whole design hinges on separating two axes that the current app conflates.

- **Engine** — a managed llama.cpp binary install. `{ id, backend, build, path,
  health, version, devices[] }`. The CRUD entity. (This is the Binaries-page
  "Your engines" list.)
- **Device** — a physical compute target, *discovered* not CRUD'd: derived from
  hardware detection (`vram.gpus`) crossed with each engine's
  `llama-bench --list-devices`. One engine can drive several devices
  (e.g. a Vulkan build → RTX 4070 *and* Radeon 890M).
- **Profile** — unchanged: a saved llama-server flag set (Launch). Do **not**
  overload this name.
- **Bench cell** — the atomic comparable: `engine × device × model × (profile?)`.
  Assembled ad-hoc on the Bench page.

Why the split: on this machine the interesting comparison is CUDA-4070 vs
Vulkan-4070 vs Vulkan-890M vs CPU. The Vulkan build appears twice (two GPUs), so
the comparable unit is **(engine × device)**, never engine alone. `llama-bench`
models this natively (`--list-devices`, `-dev <dev0/dev1>`).

The two pages reinforce each other: **Binaries acquires & manages engines;
Bench compares them across devices.**

---

## 2. Part A — Binaries page → "Engines"

### Problems being fixed
1. Three nested scroll regions + hard-coded `h-[400px]` row (scroll-trap).
2. Inverted hierarchy: the historical release catalog is loudest; "what do I
   have & does it work" is buried.
3. Two un-reconciled "installed" lists (managed vs discovered) with different
   cards/actions; the real winget install shows up as a degenerate
   "external · UNKNOWN" row.
4. Health is invisible on managed installs — even though `installs` already has
   `health_status / last_verified / version_raw / version_build` columns.
5. No way to choose which engine Launch uses (`installed[0]` is hard-coded in
   `RunTab.tsx` / `LaunchPage.tsx`).

### Data / backend
- **Unify** managed installs + discovered externals into one derived
  `EngineRow[]`, deduped by normalized path (discovery already has the dedup key
  + `managed` flag).
- **Surface existing health columns** in the managed list (no schema change for
  health).
- **Default engine pointer**: store `defaultEngineId` in `app_kv`. Launch reads
  it instead of `installed[0]`; falls back to first healthy engine.
- **Per-engine device cache**: `engine:devices` runs `llama-bench --list-devices`
  once, caches result (in `installs` row or `app_kv`). Used by both pages.

### IPC (new/changed, `src/main/ipc/binaries.ts` + `discovery.ts`)
- `engines:list` → unified `EngineRow[]` (managed ∪ discovered, deduped, health).
- `engines:setDefault(id)` / `engines:getDefault`.
- `engines:update(id)` → install newer build via existing `DownloadManager`,
  then swap default if it was default.
- `engines:verify(id)` → re-run health on a *managed* engine (today only
  discovered binaries can be verified).
- `engines:devices(installPath)` → parsed `--list-devices`.

### UI spec — single scroll, no fixed heights, no nested panels

```
┌─ Binary Management                    [Check updates] [Refresh] ─┐
│                                                                  │
│  STATUS STRIP                                                    │
│  2 engines · CUDA recommended · 1 update available               │
│                                                                  │
│  YOUR ENGINES ─────────────────────────────────── full width    │
│  ┌────────────────────────────────────────────────────────────┐│
│  │ ★ b8757 · CUDA    ● Healthy   build 8757                     ││
│  │   devices: RTX 4070                                          ││
│  │   ~/winget/.../                    [Verify] [Update] [⋯]     ││
│  ├────────────────────────────────────────────────────────────┤│
│  │   b8757 · Vulkan+CPU  ● Healthy   build 8757   [Set default] ││
│  │   devices: RTX 4070 · Radeon 890M · CPU                      ││
│  │   found on PATH                    [Import] [Verify]         ││
│  └────────────────────────────────────────────────────────────┘│
│                                                                  │
│  GET A NEW BUILD ──────────────────────────────────────────────│
│  ┌ Recommended: b9622 · CUDA · 249 MB ───────────── [Install] ─┐│
│  💡 You have CUDA. Install Vulkan to compare on the 890M.        │
│  ▸ Browse all releases (10)        ← collapsed; platform toggle  │
│                                       lives inside               │
│                                                                  │
│  ▸ Environment (4 warnings)        ← collapsed, de-emphasized    │
└──────────────────────────────────────────────────────────────────┘
```

- **Status strip**: one-glance state (counts, recommended backend, updates).
- **Your engines**: the heart. Health pill first-class; device chips (feeds the
  bench device axis); `★`/Set default; Update (wired to the "N behind" badge
  that today does nothing); Verify on managed too.
- **Get a new build**: recommended install is the single clear CTA; the 10-item
  release catalog collapses behind "Browse all releases"; nudge to install other
  backends *for comparison* (ties directly to Bench).
- **Environment**: PATH warnings renamed from "Issues" (they're env, not binary
  faults) and de-emphasized; stops inflating the sidebar "issues" count.
- **Empty state**: when nothing installed, the page becomes one guided
  "install your first engine" flow.

---

## 3. Part B — New Bench **leaderboard** page (`/bench`)

New top-level nav item after **Launch**. The existing `BenchMenuButton`
(Quick/Custom from Library) and `BenchSidebar` drawer stay for one-off runs;
this page is a **leaderboard** — every persisted bench run is one ranked entry,
sliceable across all four axes (model · engine · device · params).

Key insight: the leaderboard *is* the bench history. `BenchRunner` already
persists every run, so no separate "comparison" entity is needed.

### Core additions (`src/core/bench/`)
- `BenchSpec` gains `device?: string` (→ `-dev`) + `deviceLabel?: string`.
- `specToArgs` emits `-dev <id>` when set.
- New `parseDeviceList(stdout)` for `llama-bench --list-devices`, unit-tested
  (defensive — output format varies by build).
- A `toLeaderboardRows(jobs)` reducer: flatten done `BenchJob`s into ranked rows
  `{ model, quant, engine, device, params{ngl,fa,threads}, ppTps, tgTps, when }`.

### Backend
- `bench:listDevices(installPath)` IPC (feeds the "New bench" device picker).
- **Reuse `BenchRunner`** unchanged: one bench cell = one `enqueue()`. Single-
  active = fair benchmarking (no GPU contention).

### UI spec

```
┌─ Bench leaderboard ─────────────────────── [+ New bench] ──┐
│  Model: all ▾  Engine: all ▾  Device: all ▾  Params ▾   rank by [tg|pp] │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ 🏆 SmolLM2-135M · Q4_K_M    CUDA·RTX4070 ngl99 fa  311.7 tg ████ │
│  │ ②  SmolLM2-135M · Q4_K_M    Vulkan·RTX4070         270.0 tg ███  │
│  │ ③  Llama-3.2-1B  · Q4_K_M   CUDA·RTX4070           142.3 tg ██   │
│  │ 4  SmolLM2-135M · Q4_K_M    Vulkan·890M            95.0 tg  █    │
│  └──────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

- **Each row = one run** = model × engine × device × params; medal for top 3,
  bar relative to current #1 of the active filter.
- **Filter chips** (Model / Engine / Device / Params) narrow along any axis;
  **rank by** toggles tg ↔ pp t/s.
- **New bench** = pick model + which engine×device cells + params → enqueues runs
  (the matrix-builder becomes the *entry* flow; the board is the *result*).
- **De-dup**: keep best per unique config, expandable to full history.
- **Cross-model caveat**: a global board ranks raw speed; filter to one model for
  a fair hardware shootout. Default the Model filter to the most-benched model.
- **Export CSV/JSON** of the current (filtered) board.

---

## 4. Decisions (my recommendations, baked in)

1. **Bench v1 = 1-D**: fix the model, vary engine×device. (2-D model×hardware
   matrix later.)
2. **No auto-install** of missing backends — *nudge + deep-link* to Binaries
   instead. Surprise multi-hundred-MB downloads are bad.
3. **Ad-hoc comparisons** in v1; individual runs persist in history. "Saved
   sweeps" as a named entity is a later add.
4. **Bench is a top-level page** (not folded into Library).
5. **Reuse Launch profiles** for flag presets; don't create a parallel flag
   entity.

## 5. Sequencing

1. **Engines reorg foundation** — unified list + health surfaced + `setDefault`
   (also fixes Launch's `installed[0]` correctness bug). Biggest structural win.
2. **Update + verify-managed** actions.
3. **Device enumeration** — `--list-devices` parser + `engine:devices` cache.
4. **Bench page** — matrix builder + live results table.
5. **Polish** — bar chart, CSV export, comparison history.

Steps 1–3 are reusable infrastructure; the Bench page (4) is mostly assembly on
top of `BenchRunner` + the device axis.

## 6. Risks / notes

- **Backend ≠ all devices**: CUDA build → CUDA device only; Vulkan → `-dev` list;
  CPU via `-ngl 0`. `--list-devices` per engine resolves this per-engine.
- **iGPU (890M)** shares system RAM — VRAM-estimate semantics differ; label it.
- **Fair benchmarking** requires sequential runs — already enforced
  (BenchRunner single-active).
- **Disk**: meaningful comparison needs ≥2 backends installed (~250 MB–1 GB
  each) → surface per-engine + total disk usage on the Engines page.
- `llama-bench` prints version/status on **stderr** (already handled) and exits
  non-zero on `--list-devices` in some builds — parse defensively.
