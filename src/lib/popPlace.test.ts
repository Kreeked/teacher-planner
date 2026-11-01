import { beforeEach, describe, expect, it } from 'vitest'
import { placeBelowOrAbove, placeX } from './popPlace'

const rect = (left: number, top: number, width = 130, height = 40) =>
  ({ left, top, right: left + width, bottom: top + height, width, height }) as DOMRect

beforeEach(() => {
  Object.assign(globalThis, {
    window: { innerWidth: 393, innerHeight: 800 },
    document: { querySelectorAll: () => [] },
  })
})

describe('placeX', () => {
  it('вирівнює по лівому краю поля, коли вміщується', () => {
    expect(placeX(rect(24, 0), 272)).toBe(24)
  })
  it('дзеркально вирівнює по правому краю поля, коли ліве не вміщується', () => {
    // Поле 207…337, календар 272 px: від лівого краю вийшов би за екран.
    expect(placeX(rect(207, 0), 272)).toBe(337 - 272)
  })
  it('align=end: правий край до правого, а якщо не вміщується — лівий до лівого', () => {
    expect(placeX(rect(200, 0), 220, 'end')).toBe(330 - 220)
    expect(placeX(rect(10, 0, 40), 220, 'end')).toBe(10)
  })
  it('притискає до краю екрана, лише коли не влазить ніяк', () => {
    expect(placeX(rect(100, 0, 40), 380)).toBe(8)
  })
})

describe('placeBelowOrAbove', () => {
  it('під полем з відступом 4 px', () => {
    expect(placeBelowOrAbove(rect(0, 100), 300)).toEqual({ top: 144 })
  })
  it('над полем — прив’язка нижнім краєм, без залежності від висоти', () => {
    expect(placeBelowOrAbove(rect(0, 600), 330)).toEqual({ bottom: 800 - 600 + 4 })
  })
})
