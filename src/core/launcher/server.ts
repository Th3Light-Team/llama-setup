import { ChildProcess, spawn } from 'child_process'
import { ServerStatus } from './types'
import { buildCliArgs } from './flags'
import { resolveLlamaBinary } from './binary-resolver'

let serverProcess: ChildProcess | null = null
let serverStartTime: number | null = null
let currentPort: number | null = null

type LogCallback = (line: string) => void
let logCallback: LogCallback | null = null

export function setLogCallback(cb: LogCallback | null) {
  logCallback = cb
}

function emitLog(line: string) {
  if (logCallback) logCallback(line)
}

/**
 * Start the llama-server process.
 */
export function startServer(
  installPath: string,
  flagValues: Record<string, any>
): ServerStatus {
  if (serverProcess) {
    return getServerStatus()
  }

  const binary = resolveLlamaBinary(installPath, 'llama-server')
  if (!binary) {
    return {
      state: 'error',
      pid: null,
      port: null,
      error: `No llama-server binary found in ${installPath}`,
      uptime: null
    }
  }

  const args = buildCliArgs(flagValues)
  currentPort = flagValues.port || 8080

  emitLog(`$ ${binary} ${args.join(' ')}`)
  emitLog('')

  try {
    serverProcess = spawn(binary, args, {
      cwd: installPath,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env }
    })

    serverStartTime = Date.now()

    serverProcess.stdout?.on('data', (data: Buffer) => {
      const lines = data.toString().split('\n').filter(l => l.trim())
      lines.forEach(emitLog)
    })

    serverProcess.stderr?.on('data', (data: Buffer) => {
      const lines = data.toString().split('\n').filter(l => l.trim())
      lines.forEach(emitLog)
    })

    serverProcess.on('exit', (code, signal) => {
      emitLog(`\n[Process exited with code ${code}${signal ? `, signal ${signal}` : ''}]`)
      serverProcess = null
      serverStartTime = null
      currentPort = null
    })

    serverProcess.on('error', (err) => {
      emitLog(`[Process error: ${err.message}]`)
      serverProcess = null
      serverStartTime = null
      currentPort = null
    })

    return {
      state: 'starting',
      pid: serverProcess.pid || null,
      port: currentPort,
      error: null,
      uptime: 0
    }
  } catch (err: any) {
    return {
      state: 'error',
      pid: null,
      port: null,
      error: err.message,
      uptime: null
    }
  }
}

/**
 * Stop the running server process.
 */
export function stopServer(): ServerStatus {
  if (serverProcess) {
    emitLog('\n[Stopping server...]')
    serverProcess.kill('SIGTERM')

    // Force kill after 3 seconds
    setTimeout(() => {
      if (serverProcess) {
        serverProcess.kill('SIGKILL')
        serverProcess = null
      }
    }, 3000)
  }

  serverProcess = null
  serverStartTime = null
  currentPort = null

  return { state: 'stopped', pid: null, port: null, error: null, uptime: null }
}

/**
 * Get current server status.
 */
export function getServerStatus(): ServerStatus {
  if (!serverProcess) {
    return { state: 'stopped', pid: null, port: null, error: null, uptime: null }
  }

  return {
    state: 'running',
    pid: serverProcess.pid || null,
    port: currentPort,
    error: null,
    uptime: serverStartTime ? Math.round((Date.now() - serverStartTime) / 1000) : null
  }
}
