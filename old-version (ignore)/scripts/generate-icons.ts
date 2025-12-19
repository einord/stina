import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

type Png2Icons = {
  createICO: (input: Buffer, scale: number, compression?: number, noLegacy?: boolean, usePng?: boolean) => Buffer | null;
  createICNS: (input: Buffer, scale: number, compression?: number) => Buffer | null;
  BICUBIC: number;
};

const require = createRequire(import.meta.url);
// png2icons ships CommonJS; import via createRequire to keep ESM compatibility.
const png2icons = require('png2icons') as Png2Icons;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const SOURCE_ICON = path.resolve(ROOT_DIR, 'assets/logo.png');
const ICON_OUTPUT_DIRS = [
  path.resolve(ROOT_DIR, 'apps/desktop/src/assets/icons'),
  path.resolve(ROOT_DIR, 'apps/desktop/assets/icons'),
];
const BINARY_ICON_OUTPUT_DIRS = [path.resolve(ROOT_DIR, 'apps/desktop/assets/icons')];
const AVATAR_SOURCE = path.resolve(ROOT_DIR, 'assets/stina-avatar.png');
const AVATAR_OUTPUT_DIRS = [
  path.resolve(ROOT_DIR, 'apps/desktop/src/assets/avatars'),
  path.resolve(ROOT_DIR, 'apps/desktop/assets/avatars'),
];
const ICON_SIZES = [16, 32, 48, 64, 128, 256, 512];

/**
 * Ensures the provided directory exists, creating parent folders as needed.
 */
async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

/**
 * Generates a PNG buffer representing the base logo resized to the requested dimensions.
 * @param size Square dimension in pixels for the resized icon.
 */
async function generateIconBuffer(size: number, sourceBuffer: Buffer): Promise<Buffer> {
  return sharp(sourceBuffer)
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
}

/**
 * Writes the resized icon buffer to every output directory using a consistent filename.
 * @param size Dimension to embed in the filename for easier debugging.
 * @param data PNG buffer returned from Sharp.
 */
async function writeIconVariants(size: number, data: Buffer): Promise<void> {
  const filename = `stina-icon-${size}.png`;
  await Promise.all(
    ICON_OUTPUT_DIRS.map(async (dir) => {
      await ensureDir(dir);
      await fs.writeFile(path.join(dir, filename), data);
    }),
  );
}

/**
 * Copies the custom avatar artwork to the renderer/runtime asset folders if present.
 */
async function copyAvatarAsset(): Promise<void> {
  try {
    await fs.access(AVATAR_SOURCE);
  } catch {
    return;
  }
  const buffer = await fs.readFile(AVATAR_SOURCE);
  await Promise.all(
    AVATAR_OUTPUT_DIRS.map(async (dir) => {
      await ensureDir(dir);
      await fs.writeFile(path.join(dir, 'stina-avatar.png'), buffer);
    }),
  );
}

/**
 * Emits platform-specific bundle icons (.ico/.icns) from the base PNG.
 */
async function writeBundleIcons(sourceBuffer: Buffer): Promise<void> {
  const ico = png2icons.createICO(sourceBuffer, png2icons.BICUBIC, 0, false, true);
  const icns = png2icons.createICNS(sourceBuffer, png2icons.BICUBIC, 0);
  if (!ico || !icns) {
    throw new Error('[icons] Failed to generate .ico/.icns bundles');
  }

  await Promise.all(
    BINARY_ICON_OUTPUT_DIRS.map(async (dir) => {
      await ensureDir(dir);
      await fs.writeFile(path.join(dir, 'stina-icon.ico'), ico);
      await fs.writeFile(path.join(dir, 'stina-icon.icns'), icns);
    }),
  );
}

/**
 * Entry point that validates the source asset and renders each icon size.
 */
async function main(): Promise<void> {
  await fs.access(SOURCE_ICON);
  const sourceBuffer = await fs.readFile(SOURCE_ICON);
  for (const size of ICON_SIZES) {
    const buffer = await generateIconBuffer(size, sourceBuffer);
    await writeIconVariants(size, buffer);
  }
  await writeBundleIcons(sourceBuffer);
  await copyAvatarAsset();
  console.log(`[icons] Generated ${ICON_SIZES.length} sizes from ${SOURCE_ICON}`);
}

void main().catch((err) => {
  console.error('[icons] Failed to generate assets', err);
  process.exitCode = 1;
});
