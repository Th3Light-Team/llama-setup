import type { DiscoveredInstall } from '../../../core/discovery/types'

// ─── Formatting Helpers ─────────────────────────────────────────

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '—'
  if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`
  return `${(bytes / 1024).toFixed(0)} KB`
}

export function formatDownloads(count: number): string {
  if (count >= 1000) return `${(count / 1000).toFixed(1)}k`
  return String(count)
}

export function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return `${Math.floor(days / 30)}mo ago`
}

/** Parse "b9037" → "Build 9,037" */
export function humanizeTag(tag: string): string {
  const match = tag.match(/^b(\d+)$/i)
  if (match) return `Build ${parseInt(match[1], 10).toLocaleString()}`
  return tag
}

/** How many builds behind the latest */
export function buildsBehind(tag: string, latestTag: string): number | null {
  const current = tag.match(/^b(\d+)$/i)
  const latest = latestTag.match(/^b(\d+)$/i)
  if (current && latest) return parseInt(latest[1], 10) - parseInt(current[1], 10)
  return null
}

// ─── Backend Metadata ───────────────────────────────────────────

export const BACKEND_LABELS: Record<string, { label: string; icon: 'gpu' | 'cpu' }> = {
  'cuda-cu13.1':    { label: 'NVIDIA GPU (CUDA 13.1)', icon: 'gpu' },
  'cuda-cu12.4':    { label: 'NVIDIA GPU (CUDA 12.4)', icon: 'gpu' },
  'cuda-cu12.0':    { label: 'NVIDIA GPU (CUDA 12.0)', icon: 'gpu' },
  'cuda-cu11':      { label: 'NVIDIA GPU (CUDA 11)',   icon: 'gpu' },
  'metal':          { label: 'Apple GPU (Metal)',       icon: 'gpu' },
  'metal-kleidiai': { label: 'Apple GPU (KleidiAI)',    icon: 'gpu' },
  'vulkan':         { label: 'Cross-Platform GPU (Vulkan)', icon: 'gpu' },
  'rocm':           { label: 'AMD GPU (ROCm/HIP)',     icon: 'gpu' },
  'opencl':         { label: 'OpenCL GPU',             icon: 'gpu' },
  'sycl':           { label: 'Intel GPU (SYCL)',        icon: 'gpu' },
  'sycl-fp16':      { label: 'Intel GPU (SYCL FP16)',   icon: 'gpu' },
  'openvino':       { label: 'Intel OpenVINO',          icon: 'gpu' },
  'aclgraph':       { label: 'Ascend NPU (ACL)',        icon: 'gpu' },
  'cpu':            { label: 'CPU Only',                icon: 'cpu' },
}

export const BACKEND_COLORS: Record<string, string> = {
  'cuda-cu13.1': 'bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20',
  'cuda-cu12.4': 'bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20',
  'cuda-cu12.0': 'bg-green-500/10 text-green-600 dark:text-green-500 border-green-500/20',
  'cuda-cu11':   'bg-green-500/10 text-green-600 dark:text-green-500 border-green-500/20',
  'metal':       'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20',
  'metal-kleidiai': 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20',
  'vulkan':      'bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20',
  'rocm':        'bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20',
  'opencl':      'bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20',
  'sycl':        'bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border-cyan-500/20',
  'sycl-fp16':   'bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border-cyan-500/20',
  'openvino':    'bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/20',
  'aclgraph':    'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20',
  'cpu':         'bg-slate-500/10 text-slate-700 dark:text-slate-400 border-slate-500/20',
}

// ─── Health Helpers ─────────────────────────────────────────────

export function getHealthColor(status: string): string {
  switch (status) {
    case 'healthy':  return 'bg-green-50/50 text-green-600 border-green-200 dark:bg-green-950/50 dark:text-green-400 dark:border-green-800'
    case 'degraded': return 'bg-amber-50/50 text-amber-600 border-amber-200 dark:bg-amber-950/50 dark:text-amber-400 dark:border-amber-800'
    case 'broken':   return 'bg-red-50/50 text-red-600 border-red-200 dark:bg-red-950/50 dark:text-red-400 dark:border-red-800'
    default:         return 'bg-slate-50/50 text-slate-500 border-slate-200 dark:bg-slate-950/50 dark:text-slate-400 dark:border-slate-700'
  }
}

export function getHealthLabel(status: string): string {
  switch (status) {
    case 'healthy': return 'Healthy'
    case 'degraded': return 'Degraded'
    case 'broken': return 'Broken'
    default: return 'Unknown'
  }
}

export function getSourceLabel(install: DiscoveredInstall): string {
  switch (install.source.type) {
    case 'path':            return 'Found on PATH'
    case 'package_manager': return `Via ${(install.source as any).manager}`
    case 'well_known':      return 'Well-known location'
    case 'ollama':          return 'Ollama'
    case 'process':         return `Running (PID ${(install.source as any).pid})`
    default:                return 'External'
  }
}
