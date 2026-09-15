import { expect, test } from '@playwright/test'
import { spaNavigate } from './helpers'

async function signInDitel(page: import('@playwright/test').Page) {
  await page.goto('/login')
  await page.getByLabel('Matrícula').fill('200001')
  await page.getByLabel('Senha').fill('sigat-ditel')
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page).toHaveURL(/dashboard|painel|inventario/, { timeout: 15000 })
}

test('DITEL manages equipment types catalog', async ({ page }) => {
  await signInDitel(page)
  await spaNavigate(page, '/tipos-equipamento')
  await expect(page).toHaveURL(/tipos-equipamento/)

  await expect(page.getByRole('heading', { name: 'Tipos de equipamento' })).toBeVisible({ timeout: 15000 })
  await expect(page.getByRole('button', { name: '+ Novo tipo' })).toBeVisible()

  // Create a new type
  await page.getByRole('button', { name: '+ Novo tipo' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Nome do tipo').fill('Drone')
  await dialog.getByLabel('Descrição do tipo').fill('Aeronave remotamente pilotada')
  await dialog.getByRole('button', { name: 'Salvar tipo' }).click()
  await expect(page.getByText('Drone')).toBeVisible()

  // Edit it
  const droneRow = page.getByRole('row', { name: /Drone/ })
  await droneRow.getByRole('button', { name: 'Editar' }).click()
  const editDialog = page.getByRole('dialog')
  await editDialog.getByLabel('Nome do tipo').fill('Drone de reconhecimento')
  await editDialog.getByRole('button', { name: 'Salvar alterações' }).click()
  await expect(page.getByText('Drone de reconhecimento')).toBeVisible()

  // Deactivate it
  page.once('dialog', (dialog) => dialog.accept())
  const droneRow2 = page.getByRole('row', { name: /Drone de reconhecimento/ })
  await droneRow2.getByRole('button', { name: /desativar/i }).click()
  await expect(page.getByText('Desativado')).toBeVisible()
})