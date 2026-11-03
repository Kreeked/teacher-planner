import { describe, expect, it } from 'vitest'
import { count, plural } from './plural'

describe('plural', () => {
  it('вибирає форму за числом', () => {
    expect([1, 2, 5, 11, 12, 21, 24, 25].map((n) => plural(n, 'урок', 'уроки', 'уроків'))).toEqual([
      'урок', 'уроки', 'уроків', 'уроків', 'уроків', 'урок', 'уроки', 'уроків',
    ])
  })
  it('count додає число', () => {
    expect(count(3, 'тема', 'теми', 'тем')).toBe('3 теми')
  })
})
