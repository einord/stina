import type { VerifiedVersion } from '@stina/extension-installer'
import { compareSemver } from '../../../utils/formatUtils.js'

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
