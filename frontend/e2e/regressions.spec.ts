import { expect, test } from '@playwright/test'
import { spaNavigate } from './helpers'

async function signInDitel(page: import('@playwright/test').Page) {
  await page.goto('/login')
  await page.getByLabel('Matrícula').fill('200001')
  await page.getByLabel('Senha').fill('sigat-ditel')
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page).toHaveURL(/dashboard/, { timeout: 15000 })
}

test.describe('regressões visuais das páginas de governança', () => {
  test('TopNav desktop não sobrepõe itens e usa Mais ações', async ({ page }) => {
    await signInDitel(page)
    await page.setViewportSize({ width: 1280, height: 800 })

    // Layout desktop compacto: módulo excedente atrás de "Mais ações"
    const nav = page.locator('.top-nav')
    await expect(nav).toHaveAttribute('data-layout', 'desktop')
    const moreButton = page.getByRole('button', { name: 'Mais ações' })
    await expect(moreButton).toBeVisible()

    // Sem overlap: o end (contexto + perfil) começa depois do último módulo visível
    const endBox = await page.locator('.top-nav__end').boundingBox()
    const lastLinkBox = await page.locator('.top-nav__modules li:not([hidden]) .top-nav__link').last().boundingBox()
    expect(endBox!.x).toBeGreaterThan(lastLinkBox!.x + lastLinkBox!.width)

    // Menu oficial na barra; só Administração (excedente) fica atrás de "Mais"
    for (const label of ['Painel', 'Inventário', 'Chamados', 'Movimentações', 'Relatórios', 'Manutenção']) {
      await expect(page.getByRole('link', { name: label, exact: true })).toBeVisible()
    }
    // Módulos não oficiais NÃO aparecem nem na barra nem no menu Mais
    await moreButton.click()
    const menu = page.getByRole('menu', { name: 'Mais ações' })
    await expect(menu).toBeVisible()
    await expect(page.getByRole('menuitem', { name: 'Administração', exact: true })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: /Missões técnicas/i })).toHaveCount(0)
    await expect(page.getByRole('menuitem', { name: /Tipos de equipamento/i })).toHaveCount(0)
    await expect(page.getByRole('menuitem', { name: /Auditoria/i })).toHaveCount(0)
  })

  test('TopNav tablet usa Mais ações para os módulos excedentes', async ({ page }) => {
    await signInDitel(page)
    await page.setViewportSize({ width: 850, height: 800 })

    await expect(page.locator('.top-nav')).toHaveAttribute('data-layout', 'tablet')
    const moreButton = page.getByRole('button', { name: 'Mais ações' })
    await expect(moreButton).toBeVisible()
    await moreButton.click()
    const menu = page.getByRole('menu', { name: 'Mais ações' })
    await expect(menu).toBeVisible()
    // Módulos não oficiais nunca aparecem no menu
    await expect(page.getByRole('menuitem', { name: /Missões técnicas/i })).toHaveCount(0)
    await expect(page.getByRole('menuitem', { name: /Tipos de equipamento/i })).toHaveCount(0)
    await expect(page.getByRole('menuitem', { name: /Auditoria/i })).toHaveCount(0)
  })

  test('/manutencao renderiza layout estilizado, filtros e empty state/card', async ({ page }) => {
    await signInDitel(page)
    await spaNavigate(page, '/manutencao')

    await expect(page.getByRole('heading', { name: 'Manutenções DITEL' })).toBeVisible()
    // Filtros estilizados (não botões nativos do navegador)
    const filterButtons = page.locator('.maintenance-page__filters button')
    await expect(filterButtons.first()).toHaveCSS('background-color', 'rgba(22, 119, 255, 0.12)')
    await expect(filterButtons.first()).toHaveCSS('border-radius', '999px')
    // Tabela estilizada
    const table = page.locator('.maintenance-table')
    await expect(table).toBeVisible()
    await expect(table).toHaveCSS('border-top-width', '3px')
    // Registro do seed visível
    await expect(page.getByText('Rádio sem transmissão.')).toBeVisible()
    await expect(page.getByText('Revisão preventiva do GPS.')).toBeVisible()
    // Empty state ao filtrar uma situação sem registros
    await page.getByRole('button', { name: 'Cancelada', exact: true }).click()
    await expect(page.getByText('Nenhuma manutenção encontrada')).toBeVisible()
  })

  test('/missoes-tecnicas renderiza tabela estilizada e botão Nova missão', async ({ page }) => {
    await signInDitel(page)
    await spaNavigate(page, '/missoes-tecnicas')

    await expect(page.getByRole('heading', { name: 'Missões técnicas' })).toBeVisible()
    await expect(page.getByRole('button', { name: '+ Nova missão' })).toBeVisible()
    await expect(page.locator('.missions-list')).toBeVisible()
    await expect(page.getByText('Instalar rádio na Sala de Comunicações').first()).toBeVisible()
  })

  test('/tipos-equipamento renderiza tabela estilizada e botão Novo tipo', async ({ page }) => {
    await signInDitel(page)
    await spaNavigate(page, '/tipos-equipamento')

    await expect(page.getByRole('heading', { name: 'Tipos de equipamento' })).toBeVisible()
    await expect(page.getByRole('button', { name: '+ Novo tipo' })).toBeVisible()
    await expect(page.locator('.equipment-types-list')).toBeVisible()
    await expect(page.getByText('Rádio portátil').first()).toBeVisible()
  })

  test('/auditoria renderiza filtros, tabela e modal before/after', async ({ page }) => {
    await signInDitel(page)
    await spaNavigate(page, '/auditoria')

    await expect(page.getByRole('heading', { name: 'Auditoria' })).toBeVisible()
    await expect(page.locator('.audit-filters')).toBeVisible()
    await expect(page.locator('.audit-table-wrap')).toBeVisible()
    // Abre detalhe do evento com before/after
    await page.locator('.audit-table__row').first().click()
    const dialog = page.getByRole('dialog', { name: 'Detalhes do evento de auditoria' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText('Antes')).toBeVisible()
    await expect(dialog.getByText('Depois')).toBeVisible()
    await dialog.getByRole('button', { name: 'Fechar' }).click()
    await expect(dialog).toHaveCount(0)
  })
})