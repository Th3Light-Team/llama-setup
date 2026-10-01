/**
 * Spawns a real (fake) llama-server shell script to exercise the launcher end
 * to end: binary resolution -> CLI args -> process lifecycle -> log streaming.
 * POSIX only (needs a #!/bin/sh script).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, writeFile, chmod, rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { startServer, stopServer, getServerStatus, setLogCallback } from './server'
import { getDefaultValues } from './flags'

let dir: string
let logs: string[]

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'llama-server-'))
  logs = []
  setLogCallback(l => logs.push(l))
})
afterEach(async () => {
  stopServer()
  setLogCallback(null)
  await rm(dir, { recursive: true, force: true })
})

async function waitFor(pred: () => boolean, ms = 3000): Promise<void> {
  const t = Date.now()
  while (!pred()) {
    if (Date.now() - t > ms) throw new Error(`timeout; logs=${JSON.stringify(logs)}`)
    await new Promise(r => setTimeout(r, 20))
  }
}

describe('startServer: error paths (all platforms)', () => {
  it('reports an error state when no llama-server exists in the install dir', () => {
    const st = startServer(dir, getDefaultValues())
    expect(st.state).toBe('error')
    expect(st.error).toMatch(/No llama-server binary found/)
    expect(getServerStatus().state).toBe('stopped')
  })
})

describe.skipIf(process.platform === 'win32')('startServer: real process', () => {
  async function installFake(script: string): Promise<void> {
    const p = join(dir, 'llama-server')
    await writeFile(p, `#!/bin/sh\n${script}\n`)
    await chmod(p, 0o755)
  }

  it('spawns the binary with only non-default flags, in the install dir, and streams its output', async () => {
    await installFake('echo "ARGS:$*"; echo "CWD:$(pwd)"; sleep 5')
    const st = startServer(dir, { ...getDefaultValues(), model: '/m/x.gguf', port: 9191, ctx_size: 8192 })

    expect(st.state).toBe('starting')
    expect(st.port).toBe(9191)
    expect(st.pid).toBeGreaterThan(0)
    expect(getServerStatus().state).toBe('running')

    await waitFor(() => logs.some(l => l.startsWith('ARGS:')) && logs.some(l => l.startsWith('CWD:')))
    expect(logs.find(l => l.startsWith('ARGS:'))).toBe('ARGS:-m /m/x.gguf -c 8192 --port 9191')
    expect(logs.find(l => l.startsWith('CWD:'))).toMatch(/llama-server-/)
  })

  it('is idempotent while running (second start returns the live status, no second process)', async () => {
    await installFake('sleep 5')
    const first = startServer(dir, getDefaultValues())
    const second = startServer(dir, getDefaultValues())
    expect(second.state).toBe('running')
    expect(second.pid).toBe(first.pid)
  })

  it('goes back to stopped when the process exits on its own and logs the exit code', async () => {
    await installFake('exit 3')
    startServer(dir, getDefaultValues())
    await waitFor(() => getServerStatus().state === 'stopped')
    expect(logs.some(l => l.includes('exited with code 3'))).toBe(true)
  })

  it('stopServer terminates the process and resets state', async () => {
    await installFake('sleep 30')
    const { pid } = startServer(dir, getDefaultValues())
    const st = stopServer()
    expect(st.state).toBe('stopped')
    expect(getServerStatus().state).toBe('stopped')
    await waitFor(() => {
      try { process.kill(pid!, 0); return false } catch { return true }
    })
  })
})
