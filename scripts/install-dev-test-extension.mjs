#!/usr/bin/env node
/**
 * Install the dev-test extension into the local Stina dev environment.
 *
 * Usage: node scripts/install-dev-test-extension.mjs
 *   (or via pnpm: pnpm dev:install-test-ext)
 *
 * Docker caveat: the absolute path written to installed-extensions.json is
 * host-relative. For `pnpm dev:docker`, run this script inside the container
 * so the written path is the in-container path (e.g. /data/extensions/local/dev-test).
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

// Absolute path written to installed-extensions.json (host-relative).
const absPath = resolve(destBase)

// Upsert into installed-extensions.json.
let entries = []
try {
  const raw = await readFile(installedJsonPath, 'utf8')
  entries = JSON.parse(raw)
} catch {
  // File missing or empty — start fresh.
}

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
