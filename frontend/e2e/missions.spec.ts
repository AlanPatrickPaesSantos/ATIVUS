import { expect, test } from '@playwright/test'
import { spaNavigate } from './helpers'

async function signInDitel(page: import('@playwright/test').Page) {
  await page.goto('/login')
  await page.getByLabel('Matrícula').fill('200001')
  await page.getByLabel('Senha').fill('sigat-ditel')
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page).toHaveURL(/dashboard/, { timeout: 15000 })
}

async function signInUnit(page: import('@playwright/test').Page) {
  await page.goto('/login')
  await page.getByLabel('Matrícula').fill('100001')
  await page.getByLabel('Senha').fill('sigat-unit')
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page).toHaveURL(/dashboard/, { timeout: 15000 })
}

test('DITEL creates a mission and unit starts it', async ({ page }) => {
  await signInDitel(page)
  await spaNavigate(page, '/missoes-tecnicas')
  await expect(page.getByRole('heading', { name: 'Missões técnicas' })).toBeVisible()

  // Create
  await page.getByRole('button', { name: '+ Nova missão' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Título da missão').fill('Substituir antena da torre')
  await dialog.getByLabel('Descrição da missão').fill('Substituir antena e alinhar sinal.')
  await dialog.getByLabel('Prioridade da missão').selectOption('high')
  await dialog.getByRole('button', { name: 'Criar missão' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByText('Substituir antena da torre')).toBeVisible()

  // Switch to unit WITHOUT full page reload (keeps MSW in-memory state)
  await page.locator('.top-nav__profile').focus()
  await page.keyboard.press('Enter')
  await page.getByRole('menuitem', { name: 'Sair' }).click()
  await expect(page.getByLabel('Matrícula')).toBeVisible()
  await page.getByLabel('Matrícula').fill('100001')
  await page.getByLabel('Senha').fill('sigat-unit')
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page).toHaveURL(/dashboard/, { timeout: 15000 })
  await spaNavigate(page, '/missoes-tecnicas')
  await expect(page.getByRole('heading', { name: 'Missões técnicas' })).toBeVisible()
  await page.getByText('Substituir antena da torre').click()
  const detail = page.getByRole('dialog')
  await detail.getByRole('button', { name: 'Iniciar missão' }).click()
  await expect(detail).toHaveCount(0)
  await expect(page.getByText('Em andamento').first()).toBeVisible()
})