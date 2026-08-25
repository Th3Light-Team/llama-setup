/** Result of a full system scan for llama.cpp installations */
export interface InstallationScan {
  /** All discovered installations (managed + external) */
  installations: DiscoveredInstall[]
  /** Broken or suspicious binaries found during scan */
  issues: BinaryIssue[]
  /** System PATH analysis */
  pathAnalysis: PathAnalysis
  /** Scan metadata */
  scanDurationMs: number
  scannedAt: number
  scanLocations: string[]
}

export interface DiscoveredInstall {
  /** Unique fingerprint: fast hash of binary file (first 1MB + size + mtime) */
  fingerprint: string
  /** How we found it */
  source: DiscoverySource
  /** Absolute path to the installation root (directory) */
  installPath: string
  /** Absolute path to the specific binary (llama-server, llama-cli, etc.) */
  binaryPath: string
  /** Which binary was found */
  binaryName: BinaryName
  /** Build version if determinable */
  version: VersionInfo | null
  /** Backend the binary was compiled for (if determinable) */
  backend: 'cuda' | 'metal' | 'vulkan' | 'cpu' | 'unknown'
  /** Health status of this specific binary */
  health: BinaryHealth
  /** Whether this install is already tracked in our DB */
  managed: boolean
  /** If managed, the install ID from our installs table */
  managedId: string | null
  /** File size in bytes */
  sizeBytes: number
  /** File modification time (unix ms) */
  modifiedAt: number
}

export type BinaryName =
  | 'llama-server'
  | 'llama-cli'
  | 'llama-quantize'
  | 'llama-bench'
  | 'main'
  | 'other'

export type DiscoverySource =
  | { type: 'managed' }
  | { type: 'path'; pathEntry: string }
  | { type: 'package_manager'; manager: string }
  | { type: 'well_known'; location: string }
  | { type: 'process'; pid: number }
  | { type: 'ollama' }
  | { type: 'manual'; path: string }

export interface VersionInfo {
  /** Full version string as returned by --version */
  raw: string
  /** Extracted build number (e.g., 8492 from "b8492") */
  build: number | null
  /** Commit hash if present */
  commit: string | null
}

export interface BinaryHealth {
  status: 'healthy' | 'degraded' | 'broken' | 'unknown'
  checks: HealthCheck[]
}

export interface HealthCheck {
  name: string
  passed: boolean
  detail: string
  /** Time taken for this specific check in ms */
  durationMs: number
}

export interface BinaryIssue {
  binaryPath: string
  severity: 'error' | 'warning' | 'info'
  code: BinaryIssueCode
  message: string
  /** Actionable fix suggestion */
  suggestion: string
}

export type BinaryIssueCode =
  | 'MISSING_FILE'
  | 'PERMISSION_DENIED'
  | 'MISSING_DEPENDENCY'
  | 'CORRUPT_BINARY'
  | 'VERSION_MISMATCH'
  | 'STALE_PATH'
  | 'SHADOWED_BINARY'
  | 'UNSIGNED_BINARY'
  | 'QUARANTINE_FLAG'
  | 'OUTDATED'
  | 'LEGACY_NAME'

export interface PathAnalysis {
  /** Full PATH as an ordered list of directories */
  entries: PathEntry[]
  /** Warnings about PATH configuration */
  warnings: string[]
}

export interface PathEntry {
  directory: string
  exists: boolean
  containsLlama: boolean
  llamaBinaries: string[]
  /** Priority order (0 = first on PATH, wins resolution) */
  priority: number
}

/** Options for controlling which discovery phases run */
export interface ScanOptions {
  /** Skip phases that require shell commands (faster but less thorough) */
  quickScan?: boolean
  /** Include package manager queries — slower on some systems */
  checkPackageManagers?: boolean
  /** Run process detection */
  checkRunningProcesses?: boolean
  /** Specific additional paths to scan */
  extraPaths?: string[]
}

/** Internal phase result used by the orchestrator */
export interface PhaseResult {
  installations: DiscoveredInstall[]
  issues: BinaryIssue[]
}
