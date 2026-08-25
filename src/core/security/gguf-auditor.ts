import { gguf } from '@huggingface/gguf';
import { open, stat } from 'fs/promises';

// ─── Constants ───────────────────────────────────────────────────────────────

/** Magic bytes at offset 0 of every valid GGUF file: ASCII "GGUF". */
const GGUF_MAGIC = Buffer.from([0x47, 0x47, 0x55, 0x46]);

/**
 * Highest GGUF spec version this code is tested against.
 * Update this constant (and re-audit the parser behaviour) when the spec
 * advances to v4.  Files claiming a higher version are rejected so we never
 * silently misparse a format we haven't reviewed.
 */
const MAX_SUPPORTED_GGUF_VERSION = 3;

/**
 * Maximum plausible tensor count for any real model.
 * Llama-3 70B has fewer than 1 000 tensors; even hypothetical future
 * trillion-parameter models are unlikely to exceed 100 000.
 * Anything above this threshold is almost certainly a crafted exploit file.
 */
const MAX_TENSOR_COUNT = BigInt(10_000);

/**
 * Maximum plausible key-value metadata entry count.
 * Real models carry dozens to a few hundred KV pairs; 10 000 is already
 * far beyond any legitimate use.
 */
const MAX_KV_COUNT = BigInt(10_000);

/**
 * Absolute minimum byte size of a single tensor metadata entry (name length
 * field + 1-char name + n_dims + at least one dimension + dtype + offset =
 * ~32 bytes is extremely conservative).  Used for the size-vs-claim check.
 */
const MIN_BYTES_PER_TENSOR = 32n;

// ─── Public interface ────────────────────────────────────────────────────────

export interface SafeGgufMetadata {
  version: number;
  tensorCount: number;
  kvCount: number;
  /** Architecture string from the KV store, e.g. "llama". */
  architecture: string | null;
  /** Context length declared by the model, or null if absent. */
  contextLength: number | null;
}

export interface AuditResult {
  valid: boolean;
  error?: string;
  /** Populated only when valid === true. */
  metadata?: SafeGgufMetadata;
}

// ─── Implementation ──────────────────────────────────────────────────────────

/**
 * Parses and audits the header of a GGUF file locally before attempting to
 * execute it with llama-server, protecting against memory-overflow exploits
 * and maliciously crafted files.
 *
 * Defence-in-depth strategy:
 *  1. File-size lower bound (synchronous, no library needed).
 *  2. Independent magic-byte check (4 bytes, no library needed) — we do NOT
 *     hand the file to the HF parser unless it already looks like a GGUF.
 *  3. HF GGUF parser — header only (no tensor data is read).
 *  4. Version bounds (BigInt-safe comparison).
 *  5. Tensor / KV count bounds (BigInt-safe comparison before Number cast).
 *  6. File-size vs. claimed-tensor-count plausibility check.
 *  7. Only a sanitised subset of metadata is returned to callers.
 */
export async function auditGgufFile(filePath: string): Promise<AuditResult> {
  // ── Step 1: File-size lower bound ─────────────────────────────────────────
  let fileSize: bigint;
  try {
    const fileStat = await stat(filePath);
    fileSize = BigInt(fileStat.size);
    // GGUF header minimum: 4 (magic) + 4 (version) + 8 (tensor_count) +
    // 8 (metadata_kv_count) = 24 bytes.
    if (fileSize < 24n) {
      return { valid: false, error: 'File is too small to be a valid GGUF (< 24 bytes).' };
    }
  } catch (err: any) {
    return { valid: false, error: `Cannot stat file: ${err.message}` };
  }

  // ── Step 2: Independent magic-byte check ──────────────────────────────────
  // We read the first 4 bytes ourselves before handing the file to the HF
  // parser.  If the magic is wrong there is no point (and no safety) in
  // running the parser against arbitrary binary content.
  try {
    const fh = await open(filePath, 'r');
    try {
      const buf = Buffer.alloc(4);
      const { bytesRead } = await fh.read(buf, 0, 4, 0);
      if (bytesRead < 4 || !buf.equals(GGUF_MAGIC)) {
        return { valid: false, error: 'File does not start with the GGUF magic bytes.' };
      }
    } finally {
      await fh.close();
    }
  } catch (err: any) {
    return { valid: false, error: `Cannot read file magic: ${err.message}` };
  }

  // ── Steps 3–7: HF parser + bounds checks ──────────────────────────────────
  try {
    const { metadata } = await gguf(filePath, { allowLocalFile: true });

    // ── Step 4: Version bounds ───────────────────────────────────────────────
    const version = metadata?.version;
    if (version === undefined || typeof version !== 'number') {
      return { valid: false, error: 'GGUF header is missing the version field.' };
    }
    if (version < 1 || version > MAX_SUPPORTED_GGUF_VERSION) {
      return {
        valid: false,
        error: `Unsupported GGUF version ${version}. Supported range: 1–${MAX_SUPPORTED_GGUF_VERSION}.`
      };
    }

    // ── Step 5: Tensor / KV count bounds (BigInt-safe) ──────────────────────
    // The HF library returns these as BigInt.  We MUST compare as BigInt
    // before converting to Number — Number() silently loses precision above
    // 2^53 − 1, which would allow a crafted file to bypass the check.
    const rawTensorCount = metadata?.tensor_count;
    const rawKvCount     = metadata?.kv_count;

    if (rawTensorCount === undefined || rawTensorCount === null) {
      return { valid: false, error: 'GGUF header is missing tensor_count.' };
    }
    if (rawKvCount === undefined || rawKvCount === null) {
      return { valid: false, error: 'GGUF header is missing kv_count.' };
    }

    const tensorCountBig = BigInt(rawTensorCount);
    const kvCountBig     = BigInt(rawKvCount);

    if (tensorCountBig < 0n) {
      return { valid: false, error: 'tensor_count is negative — file is corrupt.' };
    }
    if (kvCountBig < 0n) {
      return { valid: false, error: 'kv_count is negative — file is corrupt.' };
    }
    if (tensorCountBig > MAX_TENSOR_COUNT) {
      return {
        valid: false,
        error: `Potential exploit: tensor_count (${tensorCountBig}) exceeds the maximum plausible value (${MAX_TENSOR_COUNT}).`
      };
    }
    if (kvCountBig > MAX_KV_COUNT) {
      return {
        valid: false,
        error: `Potential exploit: kv_count (${kvCountBig}) exceeds the maximum plausible value (${MAX_KV_COUNT}).`
      };
    }

    // ── Step 6: File-size vs. claimed tensor count plausibility ─────────────
    // Each tensor entry requires at minimum MIN_BYTES_PER_TENSOR bytes of
    // header data.  If the file is physically too small to hold the number of
    // tensors it claims, the header is malformed / crafted.
    const minRequiredBytes = tensorCountBig * MIN_BYTES_PER_TENSOR;
    if (fileSize < minRequiredBytes) {
      return {
        valid: false,
        error: `File too small (${fileSize} bytes) to contain the claimed ${tensorCountBig} tensor entries.`
      };
    }

    // ── Step 7: Sanitised metadata output ────────────────────────────────────
    // Only a fixed, typed subset of metadata is returned to prevent callers
    // from accidentally rendering or storing arbitrary untrusted key-value data.
    const safeMetadata: SafeGgufMetadata = {
      version,
      tensorCount: Number(tensorCountBig),
      kvCount:     Number(kvCountBig),
      architecture: extractString(metadata, 'general.architecture'),
      contextLength: extractUint32(metadata, 'llama.context_length')
        ?? extractUint32(metadata, 'general.context_length')
    };

    return { valid: true, metadata: safeMetadata };
  } catch (err: any) {
    return { valid: false, error: `Failed to parse GGUF header: ${err.message}` };
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extractString(metadata: Record<string, unknown>, key: string): string | null {
  const v = metadata?.[key];
  return typeof v === 'string' ? v : null;
}

function extractUint32(metadata: Record<string, unknown>, key: string): number | null {
  const v = metadata?.[key];
  if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return Math.trunc(v);
  if (typeof v === 'bigint' && v >= 0n && v <= BigInt(Number.MAX_SAFE_INTEGER)) return Number(v);
  return null;
}
