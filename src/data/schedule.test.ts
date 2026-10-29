import { describe, expect, it } from 'vitest'
import { addDays, weekday } from './schedule'

describe('date helpers', () => {
  it('walks over month and year boundaries', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(weekday('2026-09-01')).toBe(2) // вівторок
    expect(weekday('2026-09-06')).toBe(7) // неділя
  })
})
