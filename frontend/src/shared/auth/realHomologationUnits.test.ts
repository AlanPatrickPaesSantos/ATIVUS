import { describe, expect, it } from 'vitest'
import { REAL_HOMOLOGATION_UNITS } from '../../../e2e-real/realHomologationUnits'

describe('unidades reais selecionadas para homologação', () => {
  it('fixa exatamente 6º BPM e 21º BPM', () => {
    expect(REAL_HOMOLOGATION_UNITS).toEqual({
      A: 'pmpa:unit:bpm-06',
      B: 'pmpa:unit:bpm-21',
    })
  })
})
