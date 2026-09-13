import { expect, test } from '@playwright/test'

async function signIn(page: import('@playwright/test').Page, registration: string, password: string) {
  await page.goto('/dashboard')
  const profile = page.locator('button.top-nav__profile')
  if (await profile.count()) { await profile.click({ force: true }); await page.getByRole('menuitem', { name: 'Sair' }).click() }
  await page.goto('/login')
  await page.getByLabel('Matrícula').fill(registration)
  await page.getByLabel('Senha').fill(password)
  await page.getByRole('button', { name: 'Entrar' }).click()
}

test('unit user opens a maintenance request and sees it in the equipment detail modal', async ({ page }) => {
  await signIn(page, '100001', 'sigat-unit')
  await page.getByRole('link', { name: 'Manutenção', exact: true }).click()
  await expect(page).toHaveURL(/\/manutencao$/)
  await expect(page.getByRole('heading', { name: 'Manutenção da Unidade' })).toBeVisible()

  await page.getByRole('button', { name: '+ Abrir manutenção' }).click()
  const dialog = page.getByRole('dialog', { name: 'Abrir manutenção' })
  await expect(dialog).toBeVisible()
  await dialog.getByLabel('Equipamento').selectOption('eq-001')
  await dialog.getByLabel('Tipo de manutenção').selectOption('corrective')
  await dialog.getByLabel('Descrição do problema').fill('E2E: rádio sem transmissão após queda.')
  await dialog.getByRole('button', { name: 'Revisar manutenção' }).click()
  await expect(dialog.getByText('PAT-2026-004821 · Rádio portátil Motorola APX 2000')).toBeVisible()
  await dialog.getByRole('button', { name: 'Confirmar abertura' }).click()
  await expect(dialog.getByRole('status').getByText('Manutenção aberta com sucesso')).toBeVisible()
  await dialog.getByRole('button', { name: 'Concluir' }).click()
  await expect(page.getByText('E2E: rádio sem transmissão após queda.')).toBeVisible()

  await page.getByRole('link', { name: 'Inventário', exact: true }).click()
  await page.getByRole('button', { name: 'Ver detalhes de PAT-2026-004821' }).click()
  await expect(page.getByRole('dialog', { name: 'Equipamento PAT-2026-004821' })).toBeVisible()
  const history = page.getByTestId('equipment-maintenance-history')
  await expect(history.getByText('E2E: rádio sem transmissão após queda.')).toBeVisible()
})

test('DITEL updates and completes a maintenance with diagnosis and service', async ({ page }) => {
  await signIn(page, '200001', 'sigat-ditel')
  await page.getByRole('link', { name: 'Manutenção', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Manutenções DITEL' })).toBeVisible()

  await page.getByRole('button', { name: 'Atualizar', exact: true }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Atualizar manutenção DITEL' })
  await expect(dialog).toBeVisible()
  await dialog.getByLabel('Situação').selectOption('in_progress')
  await dialog.getByLabel('Diagnóstico').fill('Módulo de transmissão danificado.')
  await dialog.getByRole('button', { name: 'Revisar atualização' }).click()
  await dialog.getByRole('button', { name: 'Confirmar atualização' }).click()
  await expect(dialog).toHaveCount(0)

  await page.getByRole('button', { name: 'Atualizar', exact: true }).first().click()
  await dialog.getByLabel('Situação').selectOption('completed')
  await dialog.getByLabel('Diagnóstico').fill('Módulo de transmissão danificado.')
  await dialog.getByLabel('Serviço realizado').fill('Substituição do módulo de transmissão.')
  await dialog.getByLabel('Responsável técnico').fill('Equipe DITEL E2E')
  await dialog.getByRole('button', { name: 'Revisar atualização' }).click()
  await dialog.getByRole('button', { name: 'Confirmar atualização' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Concluída/ })).toBeVisible()
})