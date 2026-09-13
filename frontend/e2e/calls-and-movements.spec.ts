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

test('unit user opens a call and receives a protocol', async ({ page }) => {
  await signIn(page, '100001', 'sigat-unit')
  await page.getByRole('link', { name: 'Chamados', exact: true }).click()
  await page.getByRole('button', { name: /Rádio operacional indisponível/ }).click()
  const detailDialog = page.getByRole('dialog', { name: 'Detalhes do chamado' })
  await expect(detailDialog.getByRole('link', { name: 'evidencia.pdf' })).toHaveAttribute('href', '/api/v1/attachments/att-call-402/download')
  await detailDialog.getByRole('button', { name: 'Fechar' }).last().click()
  await page.getByLabel('Assunto').fill('Falha de teste E2E')
  await page.getByLabel('Descrição').fill('Descrição reproduzível do fluxo principal.')
  await page.getByLabel('Anexos').setInputFiles({ name: 'evidencia-e2e.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 evidencia e2e') })
  await expect(page.getByText('evidencia-e2e.pdf')).toBeVisible()
  await page.getByRole('button', { name: 'Revisar chamado' }).click()
  await expect(page.getByText('evidencia-e2e.pdf')).toBeVisible()
  await page.getByRole('button', { name: 'Enviar chamado' }).click()
  await expect(page.getByRole('heading', { name: 'Chamado enviado' })).toBeVisible()
  await expect(page.getByText('CH-2026-900')).toBeVisible()
})

test('DITEL triages a statewide call and sees the persisted decision', async ({ page }) => {
  await signIn(page, '200001', 'sigat-ditel')
  await page.getByRole('link', { name: 'Chamados', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Chamados estaduais' })).toBeVisible()

  const callCard = page.getByRole('heading', { name: 'Falha de conectividade no CIOp' }).locator('..').locator('..')
  await callCard.getByRole('button', { name: 'Triar chamado' }).click()
  const dialog = page.getByRole('dialog', { name: 'Triagem do chamado' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('Descrição persistida da API para o CIOp.')).toBeVisible()
  await expect(dialog.getByText('Chamado aberto pela Unidade.')).toBeVisible()
  await dialog.getByLabel('Seção responsável').selectOption('Suporte')
  await dialog.getByLabel('Prioridade', { exact: true }).selectOption('high')
  await dialog.getByLabel('Situação da triagem').selectOption('Resolvido')
  await dialog.getByRole('button', { name: 'Salvar triagem' }).click()

  await expect(page.getByRole('status').filter({ hasText: 'Triagem registrada no chamado.' })).toBeVisible()
  await page.getByLabel('Situação do chamado').selectOption('resolved')
  const resolvedCard = page.getByRole('heading', { name: 'Falha de conectividade no CIOp' }).locator('..').locator('..')
  await expect(resolvedCard).toBeVisible()
  await expect(resolvedCard.getByText('Suporte', { exact: true })).toBeVisible()
  await expect(resolvedCard.getByText('Alta', { exact: true })).toBeVisible()
})

test('unit user requests a transfer and DITEL can decide it', async ({ page }) => {
  await signIn(page, '100001', 'sigat-unit')
  await page.getByRole('link', { name: 'Movimentações', exact: true }).click()
  await page.getByRole('button', { name: 'Solicitar transferência' }).click()
  await page.getByLabel('Equipamento').selectOption('eq-002')
  await page.getByLabel('Unidade destino').selectOption('unit-norte')
  await page.getByRole('button', { name: 'Revisar solicitação' }).click()
  await page.getByRole('button', { name: 'Confirmar solicitação' }).click()
  await expect(page.getByRole('heading', { name: 'Solicitação registrada' })).toBeVisible()

  await signIn(page, '200001', 'sigat-ditel')
  await page.getByRole('link', { name: 'Movimentações', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Solicitações pendentes' })).toBeVisible()
  const pendingDecision = page.locator('button[aria-label^="Analisar solicitação mov-api-"]').first()
  const pendingLabel = await pendingDecision.getAttribute('aria-label')
  await pendingDecision.click()
  await page.getByRole('button', { name: 'Aprovar movimentação' }).click()
  await expect(page.getByRole('button', { name: pendingLabel ?? '' })).toHaveCount(0)
})
