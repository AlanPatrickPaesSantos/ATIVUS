import type { Page } from '@playwright/test'

/**
 * Navega para uma rota interna sem recarregar a página (a sessão MSW vive em
 * memória; um page.goto() na rota profunda a perderia). Usa history.pushState
 * como o Router do React espera, permitindo acesso direto às rotas protegidas.
 */
export async function spaNavigate(page: Page, path: string) {
  await page.evaluate((route) => {
    window.history.pushState({}, '', route)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, path)
  await page.waitForTimeout(300)
}

/** Navega para um módulo secundário via o menu "Mais ações" (acessível em desktop/tablet). */
export async function openViaMoreMenu(page: Page, label: string) {
  await page.getByRole('button', { name: 'Mais ações' }).click()
  await page.getByRole('menuitem', { name: label, exact: true }).click()
  await page.waitForTimeout(300)
}