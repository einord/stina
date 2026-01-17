/**
 * Icon generation script for Stina
 *
 * Generates all required icon formats for Electron and Web from the source icon.
 * Uses sharp for PNG generation and png-to-ico for ICO files.
 *
 * Usage:
 *   pnpm generate:icons         - Generate icons if source has changed
 *   pnpm generate:icons:force   - Force regeneration of all icons
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import pngToIco from 'png-to-ico'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')

const SOURCE_ICON = path.join(rootDir, 'assets/icon/icon.png')
const ELECTRON_ICONS_DIR = path.join(rootDir, 'apps/electron/resources/icons')
const WEB_PUBLIC_DIR = path.join(rootDir, 'apps/web/public')
const TIMESTAMP_FILE = path.join(rootDir, 'node_modules/.cache/icon-generation-timestamp')

interface IconConfig {
  name: string
  size: number
}

const ELECTRON_PNG_SIZES: IconConfig[] = [
  { name: '16x16.png', size: 16 },
  { name: '32x32.png', size: 32 },
  { name: '64x64.png', size: 64 },
  { name: '128x128.png', size: 128 },
  { name: '256x256.png', size: 256 },
  { name: '512x512.png', size: 512 },
]

const WEB_ICONS: IconConfig[] = [
  { name: 'favicon-16x16.png', size: 16 },
  { name: 'favicon-32x32.png', size: 32 },
  { name: 'apple-touch-icon.png', size: 180 },
  { name: 'icon-192x192.png', size: 192 },
  { name: 'icon-512x512.png', size: 512 },
]

/**
 * Checks if icons need to be regenerated based on source file modification time.
 *
 * @returns true if icons need regeneration, false otherwise
 */
function needsRegeneration(force: boolean): boolean {
  if (force) {
    console.log('Force flag set, regenerating all icons...')
    return true
  }

  if (!fs.existsSync(TIMESTAMP_FILE)) {
    console.log('No previous generation timestamp found, generating icons...')
    return true
  }

  const sourceStats = fs.statSync(SOURCE_ICON)
  const timestampStats = fs.statSync(TIMESTAMP_FILE)

  if (sourceStats.mtimeMs > timestampStats.mtimeMs) {
    console.log('Source icon has been modified, regenerating icons...')
    return true
  }

  console.log('Icons are up to date, skipping generation.')
  return false
}

/**
 * Saves the current timestamp to track when icons were last generated.
 */
function saveTimestamp(): void {
  const cacheDir = path.dirname(TIMESTAMP_FILE)
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true })
  }
  fs.writeFileSync(TIMESTAMP_FILE, new Date().toISOString())
}

/**
 * Generates a PNG icon at the specified size.
 *
 * @param outputPath - Path to write the icon
 * @param size - Target size in pixels
 * @param padding - Optional padding ratio (0.1 = 10% padding on each side)
 */
async function generatePng(outputPath: string, size: number, padding = 0): Promise<void> {
  if (padding > 0) {
    // Calculate inner size (icon with padding)
    const innerSize = Math.round(size * (1 - padding * 2))
    await sharp(SOURCE_ICON)
      .resize(innerSize, innerSize)
      .extend({
        top: Math.round(size * padding),
        bottom: Math.round(size * padding),
        left: Math.round(size * padding),
        right: Math.round(size * padding),
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toFile(outputPath)
  } else {
    await sharp(SOURCE_ICON).resize(size, size).png().toFile(outputPath)
  }
  console.log(
    `  Generated: ${path.basename(outputPath)} (${size}x${size}${padding ? `, ${padding * 100}% padding` : ''})`
  )
}

/**
 * Generates an ICO file from multiple PNG sizes.
 */
async function generateIco(outputPath: string, sizes: number[]): Promise<void> {
  const tempPngs: string[] = []
  const tempDir = path.join(rootDir, 'node_modules/.cache/icon-temp')

  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true })
  }

  for (const size of sizes) {
    const tempPath = path.join(tempDir, `temp-${size}.png`)
    await sharp(SOURCE_ICON).resize(size, size).png().toFile(tempPath)
    tempPngs.push(tempPath)
  }

  const icoBuffer = await pngToIco(tempPngs)
  fs.writeFileSync(outputPath, icoBuffer)

  // Clean up temp files
  for (const tempPath of tempPngs) {
    fs.unlinkSync(tempPath)
  }

  console.log(`  Generated: ${path.basename(outputPath)} (${sizes.join(', ')} px)`)
}

// Padding ratio for macOS icons (Apple recommends ~10% optical margin)
const MACOS_ICON_PADDING = 0.09

/**
 * Generates all Electron icons.
 */
async function generateElectronIcons(): Promise<void> {
  console.log('\nGenerating Electron icons...')

  if (!fs.existsSync(ELECTRON_ICONS_DIR)) {
    fs.mkdirSync(ELECTRON_ICONS_DIR, { recursive: true })
  }

  // Generate main icon.png (512x512) for electron-builder with macOS padding
  await generatePng(path.join(ELECTRON_ICONS_DIR, 'icon.png'), 512, MACOS_ICON_PADDING)

  // Generate ICO for Windows (16, 32, 48, 256) - no padding needed
  await generateIco(path.join(ELECTRON_ICONS_DIR, 'icon.ico'), [16, 32, 48, 256])

  // Generate individual PNG sizes for Linux (with padding for consistency)
  for (const config of ELECTRON_PNG_SIZES) {
    await generatePng(path.join(ELECTRON_ICONS_DIR, config.name), config.size, MACOS_ICON_PADDING)
  }
}

/**
 * Generates all web icons.
 */
async function generateWebIcons(): Promise<void> {
  console.log('\nGenerating web icons...')

  if (!fs.existsSync(WEB_PUBLIC_DIR)) {
    fs.mkdirSync(WEB_PUBLIC_DIR, { recursive: true })
  }

  // Generate favicon.ico (16, 32, 48)
  await generateIco(path.join(WEB_PUBLIC_DIR, 'favicon.ico'), [16, 32, 48])

  // Generate PNG icons
  for (const config of WEB_ICONS) {
    await generatePng(path.join(WEB_PUBLIC_DIR, config.name), config.size)
  }
}

/**
 * Main entry point for icon generation.
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const force = args.includes('--force')

  console.log('Stina Icon Generator')
  console.log('====================')

  if (!fs.existsSync(SOURCE_ICON)) {
    console.error(`Error: Source icon not found at ${SOURCE_ICON}`)
    process.exit(1)
  }

  if (!needsRegeneration(force)) {
    return
  }

  try {
    await generateElectronIcons()
    await generateWebIcons()
    saveTimestamp()

    console.log('\nIcon generation complete!')
  } catch (error) {
    console.error('Error generating icons:', error)
    process.exit(1)
  }
}

main()
