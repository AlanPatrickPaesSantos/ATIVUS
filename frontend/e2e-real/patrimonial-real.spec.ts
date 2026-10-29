import { expect, request as requestFactory, test } from '@playwright/test'

const backendUrl = process.env.E2E_REAL_BACKEND_URL ?? 'http://127.0.0.1:3010'
const frontendOrigin = `http://127.0.0.1:${process.env.E2E_REAL_FRONTEND_PORT ?? '4173'}`
const password = process.env.E2E_REAL_AC_PASSWORD
  ?? process.env.E2E_REAL_UNIT_A_PASSWORD
  ?? ''
const ditelRegistration = process.env.E2E_REAL_DITEL_REGISTRATION ?? ''
const acRegistration = process.env.E2E_REAL_AC_REGISTRATION ?? ''
const unitARegistration = process.env.E2E_REAL_UNIT_A_REGISTRATION ?? ''
const unitBRegistration = process.env.E2E_REAL_UNIT_B_REGISTRATION ?? ''
const unitAId = process.env.E2E_REAL_UNIT_A_ID ?? 'hml-unit-a'
const unitBId = process.env.E2E_REAL_UNIT_B_ID ?? 'hml-unit-b'

test.skip(!password || !ditelRegistration || !acRegistration || !unitARegistration || !unitBRegistration, 'Fixtures reais de homologação ausentes')

async function login(api: import('@playwright/test').APIRequestContext, registration: string) {
  const response = await api.post('/api/v1/auth/login', { data: { registration, password } })
  expect(response.status()).toBe(200)
  return response.json()
}

test('real backend validates unit isolation and AC return custody transition', async ({ page }) => {
  const ditel = await requestFactory.newContext({ baseURL: backendUrl, extraHTTPHeaders: { Origin: frontendOrigin } })
  const ac = await requestFactory.newContext({ baseURL: backendUrl, extraHTTPHeaders: { Origin: frontendOrigin } })
  const unitA = await requestFactory.newContext({ baseURL: backendUrl, extraHTTPHeaders: { Origin: frontendOrigin } })
  const unitB = await requestFactory.newContext({ baseURL: backendUrl, extraHTTPHeaders: { Origin: frontendOrigin } })

  await login(ditel, ditelRegistration)
  await login(ac, acRegistration)
  await login(unitA, unitARegistration)
  await login(unitB, unitBRegistration)

  const suffix = Date.now().toString(36)
  const material = await ac.post('/api/v1/ac/materials', {
    data: {
      patrimony: `E2E-RETURN-${suffix}`,
      type: 'Rádio sintético', model: 'ATIVUS-E2E', brand: 'Marca E2E',
      situation: 'active', location: 'Almoxarifado AC', category: 'Homologação E2E',
    },
  })
  expect(material.status()).toBe(201)
  const materialBody = await material.json()

  const transfer = await ac.post('/api/v1/ac/transfers', {
    headers: { 'Idempotency-Key': `e2e-transfer-${suffix}` },
    data: {
      destinationUnit: { id: unitAId, name: 'Unidade Homologação A', acronym: 'HMA' },
      distributedAt: new Date().toISOString(),
      deliverer: { name: 'Entrega E2E' }, receiver: { name: 'Recebimento E2E' },
      bg: { number: `BG-E2E-${suffix}` }, equipmentIds: [materialBody.id],
    },
  })
  expect(transfer.status()).toBe(201)

  const ownInventory = await unitA.get(`/api/v1/inventory?page=1&pageSize=20&search=${encodeURIComponent(materialBody.patrimony)}`)
  expect(ownInventory.status()).toBe(200)
  expect((await ownInventory.json()).items).toHaveLength(1)
  const foreignInventory = await unitB.get(`/api/v1/inventory?page=1&pageSize=20&search=${encodeURIComponent(materialBody.patrimony)}`)
  expect([200, 404]).toContain(foreignInventory.status())
  if (foreignInventory.status() === 200) expect((await foreignInventory.json()).items).toHaveLength(0)

  const returnRequest = await unitA.post('/api/v1/ac/returns', {
    headers: { 'Idempotency-Key': `e2e-return-${suffix}` },
    data: { equipmentId: materialBody.id, reason: 'Devolução para conferência E2E.' },
  })
  expect(returnRequest.status()).toBe(201)
  const pending = await returnRequest.json()

  expect(pending.equipment.unit.id).toBe(unitAId)

  const forbiddenDecision = await ditel.patch(`/api/v1/ac/returns/${pending.id}/decision`, { data: { status: 'Aceita', updatedAt: pending.updatedAt } })
  expect(forbiddenDecision.status()).toBe(403)
  const accepted = await ac.patch(`/api/v1/ac/returns/${pending.id}/decision`, { data: { status: 'Aceita', updatedAt: pending.updatedAt } })
  expect(accepted.status()).toBe(200)
  const acceptedBody = await accepted.json()
  expect(acceptedBody.equipment.unit.id).toBe(unitAId)
  const receipt = await ac.patch(`/api/v1/ac/returns/${pending.id}/receipt`, { data: { status: 'Recebida', updatedAt: acceptedBody.updatedAt } })
  expect(receipt.status()).toBe(200)

  const afterReceipt = await ac.get(`/api/v1/ac/materials/${materialBody.id}`)
  const afterReceiptBody = await afterReceipt.json()
  expect(afterReceiptBody.custody.scope).toBe('AC')
  const audit = await ditel.get('/api/v1/audit-events?module=ac&page=1&pageSize=100')
  expect(audit.status()).toBe(200)
  expect((await audit.json()).items.map((item: { action: string }) => item.action)).toEqual(expect.arrayContaining(['ac.return.request', 'ac.return.accept', 'ac.return.receipt']))

  await page.goto('/login')
  await page.getByLabel('Matrícula').fill(unitARegistration)
  await page.getByLabel('Senha').fill(password)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page.getByRole('heading', { name: 'Painel da Unidade' })).toBeVisible()
  await page.goto('/movimentacoes')
  await expect(page.getByRole('heading', { name: 'Histórico de movimentações' })).toBeVisible()

  await page.getByRole('button', { name: /Usuária Unidade Homologação A/ }).click()
  await page.getByRole('menuitem', { name: 'Sair' }).click()
  await expect(page.getByRole('heading', { name: 'Entrar no ATIVUS' })).toBeVisible()
  await page.getByLabel('Matrícula').fill(acRegistration)
  await page.getByLabel('Senha').fill(password)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page.getByRole('heading', { name: 'Materiais da AC' })).toBeVisible()

  await Promise.all([ditel.dispose(), ac.dispose(), unitA.dispose(), unitB.dispose()])
})
