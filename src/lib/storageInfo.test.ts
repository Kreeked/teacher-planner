import { describe, expect, it } from 'vitest'
import { cacheLabel } from './storageInfo'

describe('storageInfo', () => {
  it('дає зрозумілі назви кешам браузера', () => {
    expect(cacheLabel('planner-files').label).toBe('Файли до уроків')
    expect(cacheLabel('workbox-precache-v2-https://x.github.io/teacher-planner/').label).toBe('Оболонка застосунку')
    expect(cacheLabel('google-fonts').label).toBe('Шрифти')
    expect(cacheLabel('щось').label).toBe('Кеш «щось»')
  })
})
