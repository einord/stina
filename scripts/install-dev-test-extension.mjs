#!/usr/bin/env node
/**
 * Install the dev-test extension into the local Stina dev environment.
 *
 * Usage: node scripts/install-dev-test-extension.mjs
 *   (or via pnpm: pnpm dev:install-test-ext)
 *
 * Path convention: the script infers the path style from existing entries in
 * installed-extensions.json. If existing local entries use the in-container
 * convention (e.g. "/data/extensions/local/<id>"), the new entry follows it;
 * otherwise the host absolute path is used. This means the script works for
 * both `pnpm dev:docker` (Docker mount) and host-only `pnpm dev:web` setups
 * with EXTENSIONS_PATH pointing at the repo's data/extensions/.
 *
 * If you want to override the inferred path, pass `--path=<value>` (rarely
 * needed).
 *
 * This script is idempotent — safe to run multiple times.
 */

import { readFile, writeFile, copyFile, mkdir, access } from 'node:fs/promises'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Script lives at stina/scripts/; stina root is one level up.
const stinaRoot = resolve(__dirname, '..')

const extSrc = join(stinaRoot, 'packages', 'dev-test-extension')
const distJs = join(extSrc, 'dist', 'index.js')
const manifestSrc = join(extSrc, 'manifest.json')
const readmeSrc = join(extSrc, 'README.md')

const destBase = join(stinaRoot, 'data', 'extensions', 'local', 'dev-test')
const installedJsonPath = join(stinaRoot, 'data', 'extensions', 'installed-extensions.json')

// Verify dist/index.js exists.
try {
  await access(distJs)
} catch {
  console.error(
    'dev-test-extension not built yet. Run `pnpm build:packages` first.',
  )
  process.exit(1)
}

// Read manifest to extract id + version.
const manifest = JSON.parse(await readFile(manifestSrc, 'utf8'))
const { id, version } = manifest

// Create destination directory (mkdir -p semantics).
await mkdir(destBase, { recursive: true })

// Copy dist/index.js, manifest.json, and README.md (if present).
await copyFile(distJs, join(destBase, 'index.js'))
await copyFile(manifestSrc, join(destBase, 'manifest.json'))
try {
  await access(readmeSrc)
  await copyFile(readmeSrc, join(destBase, 'README.md'))
} catch {
  // README.md is optional — silently skip if absent.
}

// Read existing entries first so we can match their path convention.
let entries = []
try {
  const raw = await readFile(installedJsonPath, 'utf8')
  entries = JSON.parse(raw)
} catch {
  // File missing or empty — start fresh.
}

/**
 * Infer the path convention from existing local entries:
 * - If they use a "/data/extensions/local/<id>" style, mirror it.
 * - Otherwise fall back to the host absolute path.
 *
 * This matters because `pnpm dev:docker` mounts the repo's data/extensions/
 * at /data/extensions inside the container, and the validator does
 * `existsSync(path + '/manifest.json')` — host-absolute paths fail there.
 */
function inferLocalPathPrefix(existing) {
  // Look for any existing entry with a "local/" segment in its path.
  for (const e of existing) {
    if (typeof e?.path === 'string' && e.path.includes('/local/')) {
      // Extract everything up to and including '/local/'.
      const idx = e.path.indexOf('/local/')
      return e.path.slice(0, idx + '/local/'.length)
    }
  }
  return null
}

// Allow `--path=<value>` to override.
const overrideArg = process.argv.find((a) => a.startsWith('--path='))
const inferredPrefix = inferLocalPathPrefix(entries)
const absPath = overrideArg
  ? overrideArg.slice('--path='.length)
  : inferredPrefix
    ? `${inferredPrefix}${id}`
    : resolve(destBase)

const existingIndex = entries.findIndex((e) => e.id === id)
const now = new Date().toISOString()

if (existingIndex >= 0) {
  // Preserve installedAt so the file doesn't diff on every run.
  entries[existingIndex] = {
    ...entries[existingIndex],
    id,
    version,
    path: absPath,
    enabled: true,
    isUploadedLocal: true,
  }
} else {
  entries.push({
    id,
    version,
    installedAt: now,
    path: absPath,
    enabled: true,
    isUploadedLocal: true,
  })
}

// Ensure parent directory exists for installed-extensions.json.
await mkdir(dirname(installedJsonPath), { recursive: true })
await writeFile(installedJsonPath, JSON.stringify(entries, null, 2) + '\n', 'utf8')

console.log(`✓ Installed ${id} v${version} → ${absPath}`)
console.log('Restart the Stina API/Electron process to pick up the new code.')
