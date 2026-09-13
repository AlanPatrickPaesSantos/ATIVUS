import { expect, test } from '@playwright/test'

async function signIn(page: import('@playwright/test').Page, registration: string, password: string) {
  await page.goto('/login')
  await page.getByLabel('Matrícula').fill(registration)
  await page.getByLabel('Senha').fill(password)
  await page.getByRole('button', { name: 'Entrar' }).click()
}

test('unit user uploads an attachment in equipment registration and sees download metadata', async ({ page }) => {
  await signIn(page, '100001', 'sigat-unit')

  await page.getByRole('link', { name: 'Inventário', exact: true }).click()
  await expect(page.getByRole('heading', { name: /Inventário da Unidade/ })).toBeVisible()

  await page.getByRole('button', { name: '+ Novo equipamento' }).click()
  const dialog = page.getByRole('dialog', { name: 'Cadastrar equipamento' })

  // Fill the two-step registration form (chained selects: section → type → model).
  await dialog.getByLabel('Patrimônio').fill('E2E-PAT-001')
  await dialog.getByLabel('Seção responsável').selectOption('support')
  await dialog.getByLabel('Tipo').selectOption({ index: 1 })
  await dialog.getByLabel('Modelo').selectOption({ index: 1 })
  await dialog.getByLabel('Marca').fill('HP')
  await dialog.getByRole('radio', { name: 'Não' }).check()
  await dialog.getByLabel('Situação').selectOption('active')
  await dialog.getByLabel('Localização').fill('Sala E2E')

  // Attach a valid PDF.
  await dialog.getByLabel('Selecionar anexos').setInputFiles({
    name: 'termo-e2e.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4 e2e'),
  })
  await expect(dialog.getByLabel('Anexos selecionados')).toContainText('termo-e2e.pdf')

  // Continue to review and save.
  await dialog.getByRole('button', { name: 'Continuar para revisão' }).click()
  await expect(dialog.getByText('Anexos')).toBeVisible()
  await dialog.getByRole('button', { name: 'Salvar equipamento' }).click()

  await expect(dialog).toHaveCount(0)
})

test('unit user can download an owned attachment through the app', async ({ page }) => {
  await signIn(page, '100001', 'sigat-unit')

  await page.getByRole('link', { name: 'Inventário', exact: true }).click()
  await expect(page.getByRole('heading', { name: /Inventário da Unidade/ })).toBeVisible()

  await page.getByRole('button', { name: 'Ver detalhes de PAT-2026-004821' }).click()
  await expect(page.getByRole('dialog', { name: /Equipamento PAT-2026-004821/ })).toBeVisible()
  await expect(page.getByText('Manual_APX2000.pdf')).toBeVisible()
})