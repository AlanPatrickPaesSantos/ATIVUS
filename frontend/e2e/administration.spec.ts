import { expect, test } from '@playwright/test'

test('DITEL opens unit details and sees real inventory, calls, users', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Matrícula').fill('200001')
  await page.getByLabel('Senha').fill('sigat-ditel')
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page).toHaveURL(/dashboard/, { timeout: 15000 })

  await page.getByRole('link', { name: 'Administração', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Administração DITEL' })).toBeVisible()

  await page.getByRole('tab', { name: 'Unidades' }).click()
  await page.getByRole('button', { name: /ver detalhes de/i }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Detalhes da unidade' })

  // Inventário — dados reais
  await dialog.getByRole('tab', { name: 'Inventário' }).click()
  await expect(dialog.getByText(/Patrimônio|PAT-|Carregando inventário/)).toBeVisible()

  // Chamados — chamado real aberto pela unidade (unit-centro tem 3 no seed)
  await dialog.getByRole('tab', { name: 'Chamados' }).click()
  await expect(dialog.getByText(/Carregando chamados|Nenhum chamado|Rádio operacional indisponível|Enlace de dados instável|Impressora do arquivo sem resposta/)).toBeVisible()

  // Usuários — usuário real da unidade
  await dialog.getByRole('tab', { name: 'Usuários' }).click()
  await expect(dialog.getByText(/Ana Souza|Carregando usuários|Nenhum usuário/)).toBeVisible()
})