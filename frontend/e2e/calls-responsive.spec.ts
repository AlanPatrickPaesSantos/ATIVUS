import { expect, test, type Page } from '@playwright/test'

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

async function openCalls(page: Page) {
  await page.evaluate(() => {
    history.pushState({}, '', '/chamados')
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
}

async function expectContained(page: Page) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }))
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1)
}

for (const viewport of viewports) {
  test(`keeps unit calls usable at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await signIn(page, '100001', 'sigat-unit')
    await openCalls(page)
    await expect(page.getByRole('heading', { name: 'Meus chamados' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Abrir chamado' })).toBeVisible()
    await expectContained(page)
  })

  test(`keeps DITEL calls usable at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await signIn(page, '200001', 'sigat-ditel')
    await openCalls(page)
    await expect(page.getByRole('heading', { name: 'Chamados estaduais' })).toBeVisible()
    await expect(page.getByLabel('Situação do chamado')).toBeVisible()
    await expectContained(page)
  })
}

test('keeps DITEL triage modal contained on a tablet and keyboard reachable', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 })
  await signIn(page, '200001', 'sigat-ditel')
  await openCalls(page)
  const card = page.getByRole('heading', { name: 'Falha de conectividade no CIOp' }).locator('..').locator('..')
  await card.getByRole('button', { name: 'Triar chamado' }).focus()
  await expect(card.getByRole('button', { name: 'Triar chamado' })).toBeFocused()
  await card.getByRole('button', { name: 'Triar chamado' }).press('Enter')
  const dialog = page.getByRole('dialog', { name: 'Triagem do chamado' })
  await expect(dialog).toBeVisible()
  await expectContained(page)
  await dialog.getByRole('button', { name: 'Cancelar' }).focus()
  await expect(dialog.getByRole('button', { name: 'Cancelar' })).toBeFocused()
})
