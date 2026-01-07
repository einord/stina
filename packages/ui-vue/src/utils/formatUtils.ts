/**
 * Parse semver version string into numeric parts
 */
function parseSemver(version: string): number[] {
  const main = version.split('-')[0] ?? version
  return main.split('.').map((segment) => {
    const value = Number.parseInt(segment, 10)
    return Number.isNaN(value) ? 0 : value
  })
}

/**
 * Compare two semver version strings
 * Returns:
 * - negative if a < b
 * - positive if a > b
 * - 0 if equal
 */
export function compareSemver(a: string, b: string): number {
  const aParts = parseSemver(a)
  const bParts = parseSemver(b)
  const length = Math.max(aParts.length, bParts.length, 3)

  for (let index = 0; index < length; index += 1) {
    const left = aParts[index] ?? 0
    const right = bParts[index] ?? 0
    if (left > right) return 1
    if (left < right) return -1
  }

  // Numeric parts are equal; apply simple semver-style rules for pre-release tags.
  const aPre = a.includes('-') ? a.substring(a.indexOf('-') + 1) : ''
  const bPre = b.includes('-') ? b.substring(b.indexOf('-') + 1) : ''

  const aHasPre = aPre !== ''
  const bHasPre = bPre !== ''

  if (aHasPre && !bHasPre) return -1
  if (!aHasPre && bHasPre) return 1
  if (aHasPre && bHasPre) {
    const preCompare = aPre.localeCompare(bPre)
    if (preCompare < 0) return -1
    if (preCompare > 0) return 1
  }

  return 0
}
