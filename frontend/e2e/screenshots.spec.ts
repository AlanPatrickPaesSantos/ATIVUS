import { test } from '@playwright/test'
import { spaNavigate } from './helpers'

test.describe('screenshot das páginas corrigidas', () => {
  test('captura as 4 páginas estilizadas', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Matrícula').fill('200001')
    await page.getByLabel('Senha').fill('sigat-ditel')
    await page.getByRole('button', { name: 'Entrar' }).click()
    await page.waitForURL(/dashboard/, { timeout: 15000 })

    const shots: Array<[string, string]> = [
      ['/manutencao', '01-manutencao'],
      ['/missoes-tecnicas', '02-missoes'],
      ['/tipos-equipamento', '03-tipos'],
      ['/auditoria', '04-auditoria'],
    ]
    for (const [route, name] of shots) {
      await spaNavigate(page, route)
      await page.waitForTimeout(500)
      await page.screenshot({ path: `screenshots/${name}.png`, fullPage: true })
    }
    console.log('screenshots gravadas em frontend/screenshots/')
  })
})