import { rmSync } from 'node:fs'
import { join } from 'node:path'

const roots = ['.next-dev-cache']

for (const root of roots) {
  rmSync(join(process.cwd(), root), { force: true, recursive: true })
}
