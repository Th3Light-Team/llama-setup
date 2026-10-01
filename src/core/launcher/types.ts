/** A single CLI flag definition for llama-server */
export interface FlagDef {
  key: string
  flag: string
  label: string
  description: string
  group: FlagGroup
  type: 'boolean' | 'number' | 'string' | 'select'
  default: any
  options?: { value: string; label: string }[]
  min?: number
  max?: number
  step?: number
  unit?: string
  /** If true, this flag affects VRAM estimation */
  affectsVram?: boolean
  /** If true, only show for GPU backends */
  gpuOnly?: boolean
  /** Boolean flags that default to true: arguments that switch the feature off (emitted when the value is false) */
  offArgs?: string[]
}

export type FlagGroup = 'core' | 'gpu' | 'context' | 'sampling' | 'server' | 'experimental'

export interface FlagValues {
  [key: string]: any
}

export interface Profile {
  id: string
  name: string
  description: string
  backend: string
  created_at: string
  flags: FlagValues
}

export interface ServerStatus {
  state: 'stopped' | 'starting' | 'running' | 'error'
  pid: number | null
  port: number | null
  error: string | null
  uptime: number | null
}
