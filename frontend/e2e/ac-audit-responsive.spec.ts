import { expect, test, type Locator, type Page } from '@playwright/test'

const viewports = [
  { width: 320, height: 700 },
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
]

async function signIn(page: Page, registration: string, password: string) {
  await page.goto('/login')
  await page.getByLabel('Matrícula').fill(registration)
  await page.getByLabel('Senha').fill(password)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page).not.toHaveURL(/\/login$/)
}

async function navigateInApp(page: Page, path: string, heading: string) {
  await page.evaluate((nextPath) => {
    history.pushState({}, '', nextPath)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, path)
  await expect(page.getByRole('heading', { name: heading })).toBeVisible()
}

async function expectDocumentContained(page: Page) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }))
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1)
}

async function expectScrollableRegion(region: Locator, requireHorizontalScroll: boolean) {
  await expect(region).toBeVisible()
  await expect.poll(async () => region.evaluate((element) => ({
    overflowX: getComputedStyle(element).overflowX,
    scrollWidth: element.scrollWidth,
    clientWidth: element.clientWidth,
  }))).toMatchObject({ overflowX: 'auto' })
  if (requireHorizontalScroll) {
    await expect.poll(async () => region.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true)
  }
}

for (const viewport of viewports) {
  test(`AC materiais preserva tabela acessível em ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await signIn(page, '400001', 'sigat-ac')
    await navigateInApp(page, '/ac/materiais', 'Materiais da AC')
    await expectDocumentContained(page)
    await expectScrollableRegion(page.locator('.ac-materials-table'), viewport.width <= 768)
    await page.getByRole('row').nth(1).focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('dialog', { name: 'Detalhe do material AC' })).toBeVisible()
  })

  test(`AC transferências preserva histórico rolável em ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await signIn(page, '400001', 'sigat-ac')
    await navigateInApp(page, '/ac/transferencias', 'Transferências AC')
    await expectDocumentContained(page)
    await expectScrollableRegion(page.locator('.ac-transfer-table'), viewport.width <= 768)
    const exportButton = page.getByRole('button', { name: /Exportar DOCX da transferência/ }).first()
    if (await exportButton.count()) await expect(exportButton).toBeVisible()
  })

  test(`AC relatórios preserva filtros e tabela rolável em ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await signIn(page, '400001', 'sigat-ac')
    await navigateInApp(page, '/ac/relatorios', 'Relatórios patrimoniais da AC')
    await expectDocumentContained(page)
    await page.getByLabel('Situação').selectOption('maintenance')
    await page.getByRole('button', { name: 'Estoque atual' }).click()
    await expectScrollableRegion(page.locator('.ac-report-results .table-scroll'), viewport.width <= 768)
    await expect(page.getByRole('button', { name: 'Estoque atual' })).toHaveAttribute('aria-pressed', 'true')
  })

  test(`auditoria DITEL preserva tabela e detalhes em ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await signIn(page, '200001', 'sigat-ditel')
    await navigateInApp(page, '/auditoria', 'Auditoria')
    await expectDocumentContained(page)
    await expectScrollableRegion(page.locator('.audit-table-wrap'), viewport.width <= 768)
    await page.locator('.audit-table__row').first().focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('dialog', { name: 'Detalhes do evento de auditoria' })).toBeVisible()
  })
}
