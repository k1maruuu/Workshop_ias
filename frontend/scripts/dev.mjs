import { execFileSync, execSync } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { spawn } from 'node:child_process'

const args = process.argv.slice(2)
const port = readArgValue(args, '--port') ?? '3000'

stopProcessOnPort(port)
rmSync(join(process.cwd(), '.next-dev-cache'), { force: true, recursive: true })

const nextBin = join(process.cwd(), 'node_modules', 'next', 'dist', 'bin', 'next')
const child = spawn(process.execPath, [nextBin, 'dev', ...args], {
  cwd: process.cwd(),
  env: process.env,
  stdio: 'inherit',
  windowsHide: false,
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }

  process.exit(code ?? 0)
})

function readArgValue(values, name) {
  const index = values.indexOf(name)
  if (index >= 0 && values[index + 1]) return values[index + 1]

  const prefix = `${name}=`
  const joined = values.find((value) => value.startsWith(prefix))
  return joined ? joined.slice(prefix.length) : undefined
}

function stopProcessOnPort(targetPort) {
  if (process.platform !== 'win32') return

  let output = ''
  try {
    output = execSync('netstat -ano -p tcp', { encoding: 'utf8' })
  } catch {
    return
  }

  const pids = new Set()
  for (const line of output.split(/\r?\n/)) {
    if (!line.includes('LISTENING')) continue
    if (!new RegExp(`[:.]${escapeRegExp(targetPort)}\\s`).test(line)) continue

    const parts = line.trim().split(/\s+/)
    const pid = parts.at(-1)
    if (pid && /^\d+$/.test(pid)) pids.add(pid)
  }

  for (const pid of pids) {
    if (!isNextDevProcess(pid)) continue

    try {
      execFileSync('taskkill.exe', ['/PID', pid, '/F'], { stdio: 'ignore' })
    } catch {
      // The process may have already exited.
    }
  }
}

function isNextDevProcess(pid) {
  if (!existsSync('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe')) {
    return true
  }

  try {
    const commandLine = execFileSync(
      'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
      [
        '-NoProfile',
        '-Command',
        `(Get-CimInstance Win32_Process -Filter "ProcessId = ${pid}").CommandLine`,
      ],
      { encoding: 'utf8' },
    )

    return commandLine.includes('next') || commandLine.includes('node')
  } catch {
    return true
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
