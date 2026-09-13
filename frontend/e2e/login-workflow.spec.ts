import { expect, test } from '@playwright/test'

test('login workflow signal starts moving shortly after the page loads', async ({ page }) => {
  await page.goto('/login')

  const workflow = page.getByTestId('login-workflow')
  const readSignalPosition = () => workflow.evaluate((element) => Number.parseFloat(getComputedStyle(element, '::after').left))
  const initialPosition = await readSignalPosition()

  await page.waitForTimeout(700)

  expect(await readSignalPosition()).toBeGreaterThan(initialPosition + 16)
})

test('mandatory password change blocks modules until the new password is accepted', async ({ page }) => {
  await page.goto('/login')

  await page.getByLabel('Matrícula').fill('300001')
  await page.getByLabel('Senha').fill('senha-temporaria')
  await page.getByRole('button', { name: 'Entrar' }).click()

  await expect(page.getByRole('heading', { name: 'Defina uma nova senha' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Painel estadual DITEL' })).toHaveCount(0)

  await page.getByRole('textbox', { name: 'Nova senha', exact: true }).fill('nova-senha-segura')
  await page.getByRole('textbox', { name: 'Confirmar nova senha' }).fill('nova-senha-segura')
  await page.getByRole('button', { name: 'Atualizar senha' }).click()

  await expect(page.getByRole('heading', { name: 'Painel estadual DITEL' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Defina uma nova senha' })).toHaveCount(0)
})
