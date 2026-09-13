import { expect, test } from '@playwright/test'

async function signIn(page: import('@playwright/test').Page, registration: string, password: string) {
  await page.goto('/login')
  await page.getByLabel('Matrícula').fill(registration)
  await page.getByLabel('Senha').fill(password)
  await page.getByRole('button', { name: 'Entrar' }).click()
}

test('DITEL user reaches the statewide dashboard and administration route', async ({ page }) => {
  await signIn(page, '200001', 'sigat-ditel')

  await expect(page.getByRole('heading', { name: 'Painel estadual' })).toBeVisible()
  await page.getByRole('link', { name: 'Administração', exact: true }).click()
  await expect(page).toHaveURL(/\/administracao$/)
  await expect(page.getByRole('heading', { name: 'Administração DITEL' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Consultar inventário estadual' })).toBeVisible()
})

test('DITEL admin confirms a user block and refreshes the administrative list', async ({ page }) => {
  await signIn(page, '200001', 'sigat-ditel')
  await page.getByRole('link', { name: 'Administração', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Administração DITEL' })).toBeVisible()
  await page.getByRole('button', { name: 'Ver detalhes de Ana Souza' }).click()

  const dialog = page.getByRole('dialog', { name: 'Detalhes do usuário' })
  await dialog.getByRole('button', { name: 'Bloquear usuário' }).click()
  await expect(dialog.getByText('Confirmar bloqueio de Ana Souza?')).toBeVisible()
  await dialog.getByRole('button', { name: 'Confirmar bloqueio' }).click()

  await expect(page.getByRole('status')).toContainText('Ana Souza bloqueado com sucesso.')
  await expect(page.getByRole('row', { name: /Ana Souza/ })).toContainText('Bloqueado')
  await expect(dialog).toHaveCount(0)
})

test('DITEL admin edits a user profile and keeps the administration list in sync', async ({ page }) => {
  await signIn(page, '200001', 'sigat-ditel')
  await page.getByRole('link', { name: 'Administração', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Administração DITEL' })).toBeVisible()
  await page.getByRole('button', { name: 'Ver detalhes de Ana Souza' }).click()

  await page.getByRole('dialog', { name: 'Detalhes do usuário' }).getByRole('button', { name: 'Editar usuário' }).click()
  const editDialog = page.getByRole('dialog', { name: 'Editar usuário' })
  await editDialog.getByLabel('Nome completo').fill('Ana Editada E2E')
  await editDialog.getByLabel('Unidade', { exact: true }).selectOption('unit-norte')
  await editDialog.getByRole('button', { name: 'Salvar alterações' }).click()

  await expect(page.getByRole('status')).toContainText('Usuário Ana Editada E2E atualizado com sucesso.')
  await expect(page.getByRole('row', { name: /Ana Editada E2E/ })).toContainText('Unidade Norte')
  await expect(page.getByRole('dialog', { name: 'Editar usuário' })).toHaveCount(0)
})

test('DITEL admin creates a unit user with an active unit', async ({ page }) => {
  await signIn(page, '200001', 'sigat-ditel')
  await page.getByRole('link', { name: 'Administração', exact: true }).click()
  await page.getByRole('button', { name: 'Cadastrar usuário' }).click()

  const dialog = page.getByRole('dialog', { name: 'Cadastrar usuário' })
  await dialog.getByLabel('Nome completo').fill('Novo Usuário E2E')
  await dialog.getByLabel('Matrícula').fill('30001')
  await dialog.getByLabel('Senha inicial').fill('senha-segura')
  await dialog.getByLabel('Unidade', { exact: true }).selectOption('unit-centro')
  await dialog.getByRole('button', { name: 'Criar usuário' }).click()

  await expect(page.getByRole('status')).toContainText('Usuário Novo Usuário E2E cadastrado com sucesso.')
  await expect(page.getByRole('row', { name: /Novo Usuário E2E/ })).toContainText('Usuário de unidade')
})

test('Unit user is denied DITEL administration without rendering protected data', async ({ page }) => {
  await signIn(page, '100001', 'sigat-unit')

  await page.evaluate(() => {
    window.history.pushState({}, '', '/administracao')
    window.dispatchEvent(new Event('popstate'))
  })

  await expect(page.getByRole('heading', { name: 'Acesso não autorizado' })).toBeVisible({ timeout: 8000 })
  await expect(page.getByTestId('protected-module-data')).toHaveCount(0)
})
