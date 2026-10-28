import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const child = spawn('npm', ['--prefix', path.join(root, 'backend'), 'run', 'ops:pmpa-users', '--', ...process.argv.slice(2)], {
  cwd: root,
  stdio: 'inherit',
  shell: false,
})
child.once('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  else process.exitCode = code ?? 1
})
