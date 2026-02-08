import { createHttpApiClient } from '@stina/api-client'
import type { ApiClient } from '@stina/ui-vue'

/**
 * Creates an HTTP-based API client for connecting to a remote Stina API server.
 * This is used in Electron when running in remote mode.
 *
 * @param webUrl - The base URL of the web application (e.g., "https://stina.example.com")
 */
export function createRemoteApiClient(webUrl: string): ApiClient {
  // Validate the web URL before using it
  let parsedUrl: URL
  try {
    parsedUrl = new URL(webUrl)
  } catch {
    throw new Error(`Invalid webUrl provided to createRemoteApiClient: ${String(webUrl)}`)
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new Error(
      `Unsupported protocol for webUrl in createRemoteApiClient: ${parsedUrl.protocol}. Only http and https are allowed.`,
    )
  }

  // Normalize the web URL and add /api prefix
  const normalizedUrl = webUrl.endsWith('/') ? webUrl.slice(0, -1) : webUrl
  const apiBase = `${normalizedUrl}/api`

  return createHttpApiClient({
    baseUrl: apiBase,
    getAccessToken: () => localStorage.getItem('stina_access_token'),
  })
}
