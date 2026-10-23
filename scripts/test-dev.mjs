/**
 * Runs the Vitest suite with Electron's bundled Node, so better-sqlite3 stays
 * compiled for Electron and `npm run dev` keeps working without a rebuild.
 *
 *   npm run test:dev
 *   npm run test:dev -- src/core/launcher     # pass Vitest args through
 */
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'

const repo = resolve(import.meta.dirname, '..')
const electron = resolve(repo, 'node_modules', '.bin', process.platform === 'win32' ? 'electron.cmd' : 'electron')
const vitest = resolve(repo, 'node_modules', 'vitest', 'vitest.mjs')

const child = spawn(electron, [vitest, 'run', ...process.argv.slice(2)], {
  cwd: repo,
  stdio: 'inherit',
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  shell: process.platform === 'win32',
})
child.on('exit', code => process.exit(code ?? 1))
