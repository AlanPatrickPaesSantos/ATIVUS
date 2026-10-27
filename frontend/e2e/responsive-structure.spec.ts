import { expect, test, type Page } from '@playwright/test'

type Credentials = { registration: string; password: string }

async function signIn(page: Page, credentials: Credentials) {
  await page.goto('/login')
  await page.getByLabel('Matrícula').fill(credentials.registration)
  await page.getByLabel('Senha').fill(credentials.password)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page).not.toHaveURL(/\/login$/)
}

async function navigateInApp(page: Page, path: string, heading: string) {
  await page.evaluate((nextPath: string) => {
    history.pushState({}, '', nextPath)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, path)
  await expect(page.getByRole('heading', { name: heading })).toBeVisible()
}

async function expectDocumentContained(page: Page) {
  const dimensions = await page.evaluate(() => {
    const clientWidth = document.documentElement.clientWidth
    const wide = Array.from(document.querySelectorAll<HTMLElement>('*'))
      .map((element) => ({ element, rect: element.getBoundingClientRect() }))
      .filter(({ element, rect }) => {
        const style = window.getComputedStyle(element)
        return rect.width > 0 && rect.right > clientWidth + 1 && style.position !== 'fixed'
      })
      .slice(0, 8)
      .map(({ element, rect }) => ({
        tag: element.tagName,
        className: element.className,
        right: Math.round(rect.right),
        width: Math.round(rect.width),
      }))
    return { clientWidth, scrollWidth: document.documentElement.scrollWidth, wide }
  })
  expect(dimensions.scrollWidth, JSON.stringify(dimensions.wide)).toBeLessThanOrEqual(dimensions.clientWidth + 1)
}

async function expectTableCanScrollInternally(page: Page, selector: string) {
  const dimensions = await page.locator(selector).evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }))
  expect(dimensions.scrollWidth).toBeGreaterThanOrEqual(dimensions.clientWidth)
}

test.describe('mobile structural containment', () => {
  test('keeps the unit dashboard and inventory inside a 320px document', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 })
    await signIn(page, { registration: '100001', password: 'sigat-unit' })

    await navigateInApp(page, '/dashboard', 'Painel da Unidade')
    await expectDocumentContained(page)
    await expectTableCanScrollInternally(page, '.unit-inventory-snapshot__table')
    await navigateInApp(page, '/inventario', 'Inventário da Unidade')
    await expectDocumentContained(page)
    await expectTableCanScrollInternally(page, '.inventory-main__table-wrap')
  })

  test('keeps DITEL administration inside a 320px document', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 })
    await signIn(page, { registration: '200001', password: 'sigat-ditel' })

    await navigateInApp(page, '/administracao', 'Administração DITEL')
    await expectDocumentContained(page)
    await expectTableCanScrollInternally(page, '.administration-page__table')
  })

  test('keeps DITEL administration inside a 768px document', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 })
    await signIn(page, { registration: '200001', password: 'sigat-ditel' })

    await navigateInApp(page, '/administracao', 'Administração DITEL')
    await expectDocumentContained(page)
    await expectTableCanScrollInternally(page, '.administration-page__table')
  })
})
