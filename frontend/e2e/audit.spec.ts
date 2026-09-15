import { expect, test } from '@playwright/test'
import { spaNavigate } from './helpers'

test('DITEL views audit trail and opens event details', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Matrícula').fill('200001')
  await page.getByLabel('Senha').fill('sigat-ditel')
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page).toHaveURL(/dashboard/, { timeout: 15000 })

  await spaNavigate(page, '/auditoria')
  await expect(page.getByRole('heading', { name: 'Auditoria' })).toBeVisible()
  await expect(page.getByText('Atualização de manutenção')).toBeVisible()

  await page.getByText('Atualização de manutenção').click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText(/Falha no módulo/)).toBeVisible()
  await dialog.getByRole('button', { name: 'Fechar' }).click()
  await expect(dialog).toHaveCount(0)
})