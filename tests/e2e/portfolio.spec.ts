import { test, expect } from '@playwright/test'

test('modal, focus restoration and heading hierarchy', async ({ page }) => {
  await page.goto('/')
  const detail = page.getByRole('button', { name: '상세보기', exact: true }).first()
  await detail.click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('heading', { name: '프로젝트 소개', exact: true })).toBeVisible()
  await expect(dialog.locator('h1')).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
  await expect(detail).toBeFocused()
  await expect(page.locator('body')).not.toHaveClass(/scroll-locked/)
})

test('failed Markdown request can be retried', async ({ page }) => {
  let attempts = 0
  await page.route('**/content/projects/rani-bot.md', async route => {
    if (++attempts === 1) await route.fulfill({ status: 503, body: 'unavailable' })
    else await route.continue()
  })
  await page.goto('/')
  await page.getByRole('button', { name: '상세보기', exact: true }).first().click()
  await expect(page.getByRole('alert')).toBeVisible()
  await page.getByRole('button', { name: '다시 시도', exact: true }).click()
  await expect(page.getByRole('dialog').getByRole('heading', { name: '프로젝트 소개', exact: true })).toBeVisible()
})

test('theme persists and storage failures keep system preference', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/')
  await page.getByRole('button', { name: '라이트 모드로 전환', exact: true }).click()
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await page.addInitScript(() => { Storage.prototype.getItem = () => { throw new Error('storage blocked') } })
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
})

test('mobile menu unlocks when resized to desktop', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'desktop-chromium', 'Mobile navigation case')
  await page.goto('/')
  const menu = page.getByRole('button', { name: '메뉴 열기', exact: true })
  await menu.click()
  await expect(page.locator('main')).toHaveAttribute('inert', '')
  await page.keyboard.press('Escape')
  await expect(menu).toHaveAttribute('aria-expanded', 'false')
  await menu.click()
  await page.setViewportSize({ width: 1100, height: 800 })
  await expect(page.locator('body')).not.toHaveClass(/scroll-locked/)
  await expect(page.locator('main')).not.toHaveAttribute('inert', '')
})

test('project URL renders without browser JavaScript', async ({ browser, baseURL }, testInfo) => {
  const context = await browser.newContext({ javaScriptEnabled: false, ignoreHTTPSErrors: testInfo.project.use.ignoreHTTPSErrors })
  const page = await context.newPage()
  const response = await page.goto(`${baseURL}/projects/1`)
  expect(response?.status()).toBe(200)
  await expect(page.getByRole('heading', { level: 1 })).toContainText('라니몬')
  await expect(page.getByRole('heading', { name: '프로젝트 소개', exact: true })).toBeVisible()
  await context.close()
})

test('error pages preserve status and have no horizontal overflow', async ({ page }) => {
  for (const code of [403, 404, 429, 500, 503]) {
    const response = await page.goto(`/${code}`)
    expect(response?.status()).toBe(code)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.getByRole('link', { name: /홈으로 돌아가기/ })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
  }
  const response = await page.goto('/missing-page-for-test')
  expect(response?.status()).toBe(404)
})

test('older AbortSignal APIs are not required', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(AbortSignal, 'any', { value: undefined, configurable: true })
    Object.defineProperty(AbortSignal, 'timeout', { value: undefined, configurable: true })
  })
  await page.goto('/')
  await page.getByRole('button', { name: '상세보기', exact: true }).first().click()
  await expect(page.getByRole('dialog').getByRole('heading', { name: '프로젝트 소개', exact: true })).toBeVisible()
})
