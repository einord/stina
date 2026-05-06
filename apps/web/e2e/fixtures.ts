import { test as base, type Page } from '@playwright/test'

// Module-level cache — fetched once per worker
let cachedTokens: { accessToken: string; refreshToken: string } | null = null
let cachedUser: unknown = null

export const test = base.extend<{ authenticatedPage: Page }>({
  authenticatedPage: async ({ page }, use) => {
    if (!cachedTokens) {
      const res = await fetch('http://localhost:3001/auth/e2e-session', { method: 'POST' })
      const data = (await res.json()) as { tokens?: { accessToken: string; refreshToken: string }; user?: unknown; error?: string }
      if (!res.ok || !data.tokens) {
        throw new Error(`/auth/e2e-session failed (${res.status}): ${JSON.stringify(data)}`)
      }
      cachedTokens = data.tokens
      cachedUser = data.user
    }
    await page.addInitScript(
      ({ accessToken, refreshToken, user }) => {
        localStorage.setItem('stina_access_token', accessToken)
        localStorage.setItem('stina_refresh_token', refreshToken)
        localStorage.setItem('stina_user', JSON.stringify(user))
      },
      { accessToken: cachedTokens.accessToken, refreshToken: cachedTokens.refreshToken, user: cachedUser }
    )
    await use(page)
  },
})

export { expect } from '@playwright/test'
