import type { VerifiedVersion } from '@stina/extension-installer'

function parseSemver(version: string): number[] {
  const main = version.split('-')[0] ?? version
  return main.split('.').map((segment) => {
    const value = Number.parseInt(segment, 10)
    return Number.isNaN(value) ? 0 : value
  })
}

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

  return a.localeCompare(b)
}

export function getLatestVerifiedVersion(verifiedVersions?: VerifiedVersion[]): string | null {
  if (!verifiedVersions || verifiedVersions.length === 0) return null
  const versions = verifiedVersions.map((version) => version.version)
  const sorted = [...versions].sort(compareSemver)
  return sorted[sorted.length - 1] ?? null
}

export function isVersionVerified(version: string | null, verifiedVersions?: VerifiedVersion[]): boolean {
  if (!version || !verifiedVersions || verifiedVersions.length === 0) return false
  return verifiedVersions.some((verified) => verified.version === version)
}
