import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const SOURCE_ICON = path.resolve(ROOT_DIR, 'assets/logo.png');
const ICON_OUTPUT_DIRS = [
  path.resolve(ROOT_DIR, 'apps/desktop/src/assets/icons'),
  path.resolve(ROOT_DIR, 'apps/desktop/assets/icons'),
];
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
async function generateIconBuffer(size: number): Promise<Buffer> {
  return sharp(SOURCE_ICON)
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
 * Entry point that validates the source asset and renders each icon size.
 */
async function main(): Promise<void> {
  await fs.access(SOURCE_ICON);
  for (const size of ICON_SIZES) {
    const buffer = await generateIconBuffer(size);
    await writeIconVariants(size, buffer);
  }
  await copyAvatarAsset();
  console.log(`[icons] Generated ${ICON_SIZES.length} sizes from ${SOURCE_ICON}`);
}

void main().catch((err) => {
  console.error('[icons] Failed to generate assets', err);
  process.exitCode = 1;
});
