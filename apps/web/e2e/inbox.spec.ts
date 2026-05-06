import { test, expect } from './fixtures.js'

/**
 * E2E inbox tests — runs against a real API seeded with the typical-morning fixture.
 * Three tests per the brief: thread list, thread detail navigation, app-message banners.
 */

test.describe('inbox', () => {
  // Test 1 — Thread list renders seeded threads
  test('thread list renders seeded threads', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/')
    // The typical-morning fixture includes this title
    await expect(authenticatedPage.getByText('Kundärende: Akut frågor om leverans')).toBeVisible()
  })

  // Test 2 — Clicking a thread opens thread detail
  test('clicking a thread opens thread detail', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/')
    // Click the first visible thread item
    await authenticatedPage.getByText('Kundärende: Akut frågor om leverans').click()
    // Thread detail should show at least one .im message element
    await expect(authenticatedPage.locator('.im').first()).toBeVisible()
  })

  // Test 3 — App-message banners have trust-boundary class
  test('app-message banners have trust-boundary untrusted class', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/')
    // The customer mail thread contains an app message (mail kind)
    await authenticatedPage.getByText('Kundärende: Akut frågor om leverans').click()
    // The app-banner should be visible
    await expect(authenticatedPage.locator('.im__app-banner').first()).toBeVisible()
    // The primary text element within the banner carries the trust-boundary class
    await expect(authenticatedPage.locator('.im__untrusted').first()).toBeVisible()
  })
})
