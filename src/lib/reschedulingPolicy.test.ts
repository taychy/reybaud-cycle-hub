import { describe, expect, it } from 'vitest'
import { refundTiming } from './reschedulingPolicy'

const policy = 'Algo. Plazo de reintegro: 5 a 7 días hábiles. Revisaremos tu solicitud.'

describe('refundTiming', () => {
  it('refund shows 5 a 7 días hábiles', () => {
    expect(refundTiming('refund', policy)).toBe('Plazo de reintegro: 5 a 7 días hábiles.')
  })
  it('credit never gets a refund timeframe', () => {
    expect(refundTiming('credit', policy)).toBeNull()
  })
  it('plain "días" without hábiles is not shown', () => {
    expect(refundTiming('refund', 'Plazo de reintegro: de 5 a 7 días.')).toBeNull()
  })
})
