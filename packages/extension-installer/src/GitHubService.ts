/**
 * GitHub Service
 *
 * Fetches release information and manifests from GitHub repositories.
 */

import type { GitHubRelease, GitHubAsset, ExtensionInstallerOptions } from './types.js'

interface GitHubReleaseResponse {
  tag_name: string
  name: string
  body: string
  published_at: string
  assets: Array<{
    name: string
    browser_download_url: string
    size: number
  }>
}

export class GitHubService {
  private readonly logger: ExtensionInstallerOptions['logger']
  private readonly releaseCache = new Map<string, { releases: GitHubRelease[]; timestamp: number }>()
  private readonly cacheTtlMs = 5 * 60 * 1000 // 5 minutes

  constructor(options: Pick<ExtensionInstallerOptions, 'logger'>) {
    this.logger = options.logger
  }

  /**
   * Parses a GitHub repository URL into owner and repo
   */
  parseRepoUrl(repoUrl: string): { owner: string; repo: string } {
    // Handle URLs like:
    // - https://github.com/owner/repo
    // - https://github.com/owner/repo.git
    // - github.com/owner/repo
    const match = repoUrl.match(/github\.com\/([^/]+)\/([^/.]+)/)
    if (!match || !match[1] || !match[2]) {
      throw new Error(`Invalid GitHub repository URL: ${repoUrl}`)
    }
    return { owner: match[1], repo: match[2] }
  }

  /**
   * Fetches releases for a repository
   */
  async getReleases(repoUrl: string, forceRefresh = false): Promise<GitHubRelease[]> {
    const { owner, repo } = this.parseRepoUrl(repoUrl)
    const cacheKey = `${owner}/${repo}`

    // Check cache
    const now = Date.now()
    const cached = this.releaseCache.get(cacheKey)
    if (!forceRefresh && cached && now - cached.timestamp < this.cacheTtlMs) {
      return cached.releases
    }

    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/releases`
    this.logger?.debug('Fetching GitHub releases', { apiUrl })

    const response = await fetch(apiUrl, {
      headers: {
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'Stina-Extension-Installer',
      },
    })

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`Repository not found: ${owner}/${repo}`)
      }
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`)
    }

    const data = (await response.json()) as GitHubReleaseResponse[]

    const releases: GitHubRelease[] = data.map((r) => ({
      tagName: r.tag_name,
      name: r.name,
      body: r.body || '',
      publishedAt: r.published_at,
      assets: r.assets.map((a) => ({
        name: a.name,
        downloadUrl: a.browser_download_url,
        size: a.size,
      })),
    }))

    // Update cache
    this.releaseCache.set(cacheKey, { releases, timestamp: now })

    this.logger?.info('Fetched GitHub releases', { repo: `${owner}/${repo}`, count: releases.length })

    return releases
  }

  /**
   * Gets the latest release for a repository
   */
  async getLatestRelease(repoUrl: string): Promise<GitHubRelease | null> {
    const releases = await this.getReleases(repoUrl)
    return releases[0] || null
  }

  /**
   * Gets a specific release by tag
   */
  async getReleaseByTag(repoUrl: string, tag: string): Promise<GitHubRelease | null> {
    const releases = await this.getReleases(repoUrl)
    // Normalize tag (with or without 'v' prefix)
    const normalizedTag = tag.startsWith('v') ? tag : `v${tag}`
    const normalizedTagNoV = tag.startsWith('v') ? tag.slice(1) : tag

    return (
      releases.find((r) => r.tagName === tag || r.tagName === normalizedTag || r.tagName === normalizedTagNoV) || null
    )
  }

  /**
   * Finds the extension zip asset in a release
   */
  findZipAsset(release: GitHubRelease): GitHubAsset | null {
    // Look for .zip files, prefer ones that don't contain 'source' in name
    const zips = release.assets.filter((a) => a.name.endsWith('.zip') && !a.name.toLowerCase().includes('source'))

    // If multiple zips, prefer one with a name pattern like "extension-name-version.zip"
    return zips[0] ?? null
  }

  /**
   * Gets the raw manifest.json from a repository's main branch
   */
  async getManifestFromRepo(repoUrl: string): Promise<Record<string, unknown> | null> {
    const { owner, repo } = this.parseRepoUrl(repoUrl)

    // Try common locations
    const paths = ['manifest.json', 'extension/manifest.json']

    for (const path of paths) {
      const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/main/${path}`

      try {
        const response = await fetch(rawUrl)
        if (response.ok) {
          return (await response.json()) as Record<string, unknown>
        }
      } catch {
        // Try next path
      }
    }

    return null
  }

  /**
   * Clears the release cache
   */
  clearCache(): void {
    this.releaseCache.clear()
  }
}
