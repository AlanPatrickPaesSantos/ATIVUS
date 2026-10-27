import { expect, test, type Page } from '@playwright/test'

type Credentials = { registration: string; password: string }

const viewports = [
  { width: 320, height: 700 },
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
]

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
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }))
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1)
}

for (const viewport of viewports) {
  test(`keeps unit reports contained at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await signIn(page, { registration: '100001', password: 'sigat-unit' })
    await navigateInApp(page, '/relatorios', 'Relatórios patrimoniais')
    await expectDocumentContained(page)
  })

  test(`keeps DITEL reports contained at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await signIn(page, { registration: '200001', password: 'sigat-ditel' })
    await navigateInApp(page, '/relatorios', 'Relatórios patrimoniais')
    await expectDocumentContained(page)
  })

  test(`keeps the DITEL dashboard contained at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await signIn(page, { registration: '200001', password: 'sigat-ditel' })
    await navigateInApp(page, '/dashboard', 'Painel estadual')
    await expectDocumentContained(page)
  })
}

test('allows a unit operator to change the report filter and refresh the preview', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await signIn(page, { registration: '100001', password: 'sigat-unit' })
  await navigateInApp(page, '/relatorios', 'Relatórios patrimoniais')
  await page.getByLabel('Situação').selectOption('maintenance')
  await page.getByRole('button', { name: 'Atualizar prévia' }).click()
  await expect(page.getByText('Em manutenção', { exact: false }).last()).toBeVisible()
  await expectDocumentContained(page)
})

test('allows DITEL to open advanced dashboard filters without overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await signIn(page, { registration: '200001', password: 'sigat-ditel' })
  await navigateInApp(page, '/dashboard', 'Painel estadual')
  const advanced = page.getByRole('button', { name: /filtros avançados/i })
  await advanced.click()
  await expect(advanced).toHaveAttribute('aria-expanded', 'true')
  await expectDocumentContained(page)
})
