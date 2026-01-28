/**
 * Generate JSON Schema from Zod schemas
 *
 * This script generates a JSON Schema file from the Zod-based manifest schema.
 * Run with: pnpm build:schema
 */

import { zodToJsonSchema } from 'zod-to-json-schema'
import { ExtensionManifestSchema } from '../src/schemas/manifest.schema.js'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const packageRoot = join(__dirname, '..')

// Generate JSON Schema from Zod schema
const jsonSchema = zodToJsonSchema(ExtensionManifestSchema, {
  name: 'ExtensionManifest',
  $refStrategy: 'none', // Inline all definitions for better IDE support
  errorMessages: true,
})

// Add standard JSON Schema metadata
const schema = {
  $schema: 'https://json-schema.org/draft-07/schema#',
  $id: 'https://stina.app/schemas/extension-manifest.json',
  title: 'Stina Extension Manifest',
  description: 'Schema for Stina extension manifest.json files',
  ...jsonSchema,
}

// Ensure output directory exists
const outputDir = join(packageRoot, 'schema')
mkdirSync(outputDir, { recursive: true })

// Write schema file
const outputPath = join(outputDir, 'extension-manifest.schema.json')
writeFileSync(outputPath, JSON.stringify(schema, null, 2))

console.log(`Generated JSON Schema: ${outputPath}`)
