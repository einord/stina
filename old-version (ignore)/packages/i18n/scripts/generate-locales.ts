#!/usr/bin/env bun
/**
 * Generates TypeScript locale files from JSON5 sources.
 * Run this script whenever you edit .json5 locale files.
 */
import { readFileSync, readdirSync, writeFileSync } from 'fs';
import JSON5 from 'json5';
import { join } from 'path';

// In Bun, __dirname is available as a global
// @ts-ignore - Bun provides __dirname
const localesDir = join(__dirname, '../src/locales');

// Find all .json5 files
const json5Files = readdirSync(localesDir).filter((f) => f.endsWith('.json5'));

console.log(`[i18n] Generating TypeScript files from JSON5 sources...`);

for (const file of json5Files) {
  const lang = file.replace('.json5', '');
  const json5Path = join(localesDir, file);
  const tsPath = join(localesDir, `${lang}.ts`);

  // Read and parse JSON5
  const content = readFileSync(json5Path, 'utf-8');
  const data = JSON5.parse(content);

  // Generate TypeScript file
  const tsContent = `// Auto-generated from ${file} - DO NOT EDIT MANUALLY
// Run 'bun run build:locales' to regenerate

export default ${JSON.stringify(data, null, 2)};
`;

  writeFileSync(tsPath, tsContent, 'utf-8');
  console.log(`[i18n] ✓ Generated ${lang}.ts from ${file}`);
}

console.log(`[i18n] Done! Generated ${json5Files.length} locale files.`);
