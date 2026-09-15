import { expect, test } from '@playwright/test'

async function signInAsUnit(page: import('@playwright/test').Page) {
  await page.goto('/dashboard')
  const profile = page.locator('button.top-nav__profile')
  if (await profile.count()) { await profile.click({ force: true }); await page.getByRole('menuitem', { name: 'Sair' }).click() }
  await page.goto('/login')
  await page.getByLabel('Matrícula').fill('100001')
  await page.getByLabel('Senha').fill('sigat-unit')
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page.getByRole('heading', { name: 'Painel da Unidade' })).toBeVisible()
}

test('Unit user filters inventory through URL parameters and opens the equipment handoff', async ({ page }) => {
  await signInAsUnit(page)

  await page.getByRole('link', { name: 'Inventário', exact: true }).click()
  await expect(page).toHaveURL(/\/inventario$/)
  await expect(page.getByRole('searchbox', { name: 'Buscar equipamento' })).toBeVisible()

  await page.evaluate(() => {
    const url = new URL(window.location.href)
    url.searchParams.set('pageSize', '3')
    window.history.pushState({}, '', url)
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
  await expect(page.getByRole('button', { name: 'Página 1', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Próxima página' })).toBeEnabled()
  await page.getByRole('button', { name: 'Próxima página' }).evaluate((button) => button.click())
  await expect(page).toHaveURL(/page=2/)
  await expect(page.getByRole('button', { name: 'Página 2', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Ver detalhes de PAT-2026-004824' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Ver detalhes de PAT-2026-004823' })).toHaveCount(0)

  await page.getByRole('searchbox', { name: 'Buscar equipamento' }).fill('APX')
  await expect(page).toHaveURL(/search=APX/)
  await page.getByRole('combobox', { name: 'Tipo' }).selectOption('Rádio portátil')
  await expect(page).toHaveURL(/type=R%C3%A1dio\+port%C3%A1til/)
  await page.getByRole('combobox', { name: 'Modelo' }).selectOption('APX 2000')
  await expect(page).toHaveURL(/model=APX\+2000/)

  await page.getByRole('button', { name: 'Ver detalhes de PAT-2026-004821' }).click()
  await expect(page.getByRole('dialog', { name: 'Equipamento PAT-2026-004821' })).toBeVisible()
  await page.getByRole('tab', { name: 'Dados técnicos' }).click()
  await expect(page.getByText('APX2K26F7Q01234')).toBeVisible()
  await page.getByRole('tab', { name: 'Histórico' }).click()
  await expect(page.getByRole('tabpanel').getByText('Transferido de CME para 3º BPM.')).toBeVisible()
  await page.getByRole('tab', { name: 'Chamados' }).click()
  await expect(page.getByRole('tabpanel').getByText('Falha intermitente no áudio')).toBeVisible()
  await page.getByRole('tab', { name: 'Documentos' }).click()
  await expect(page.getByRole('tabpanel').getByRole('link', { name: 'Manual_APX2000.pdf' })).toHaveAttribute('href', '/api/v1/attachments/manual-apx/download')

  await page.getByRole('button', { name: 'Abrir chamado' }).click()
  await expect(page).toHaveURL(/\/chamados\?equipmentId=eq-001$/)
})

test('Unit user registers equipment with a private attachment', async ({ page }) => {
  await signInAsUnit(page)
  await page.getByRole('link', { name: 'Inventário', exact: true }).click()
  await page.getByRole('button', { name: '+ Novo equipamento' }).click()
  const dialog = page.getByRole('dialog', { name: 'Cadastrar equipamento' })
  await dialog.getByLabel('Patrimônio').fill('PAT-2026-E2E999')
  await dialog.getByLabel('Seção responsável').selectOption('support')
  await dialog.getByLabel('Tipo').selectOption('Computador portátil')
  await dialog.getByLabel('Modelo').selectOption('Dell Latitude 5420')
  await dialog.getByLabel('Número de série').fill('E2E-SN-999')
  await dialog.getByLabel('Marca').fill('Dell')
  await dialog.getByLabel('Garantia').getByLabel('Não').check()
  await dialog.getByLabel('Situação').selectOption('active')
  await dialog.getByLabel('Localização').fill('Laboratório E2E')
  await dialog.getByLabel('Selecionar anexos').setInputFiles({ name: 'termo-e2e.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 termo e2e') })
  await expect(dialog.getByText('termo-e2e.pdf')).toBeVisible()
  await dialog.getByRole('button', { name: 'Continuar para revisão' }).click()
  await expect(dialog.getByText('termo-e2e.pdf')).toBeVisible()
  await dialog.getByRole('button', { name: 'Salvar equipamento' }).click()
  await expect(dialog).toHaveCount(0)
})

test('mobile inventory renders cards and a full-screen equipment dialog', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await signInAsUnit(page)
  await page.getByRole('button', { name: 'Menu' }).click()
  await page.getByRole('link', { name: 'Inventário', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Menu' })).toHaveAttribute('aria-expanded', 'false')

  await expect(page.getByTestId('inventory-layout')).toHaveAttribute('data-layout', 'mobile')
  await page.getByRole('button', { name: 'Ver detalhes de PAT-2026-004821' }).click()
  await expect(page.locator('.modal-backdrop')).toHaveAttribute('data-mobile', 'true')
  const dialog = page.getByRole('dialog', { name: 'Equipamento PAT-2026-004821' })
  await expect(dialog).toBeVisible()
  const dialogBox = await dialog.boundingBox()
  const viewport = page.viewportSize()
  expect(dialogBox).not.toBeNull()
  expect(viewport).not.toBeNull()
  if (dialogBox && viewport) {
    const tolerance = 2
    expect(dialogBox.x).toBeLessThanOrEqual(tolerance)
    expect(dialogBox.y).toBeLessThanOrEqual(tolerance)
    expect(dialogBox.width).toBeGreaterThanOrEqual(viewport.width - tolerance)
    expect(dialogBox.height).toBeGreaterThanOrEqual(viewport.height - tolerance)
  }
})
