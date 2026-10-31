import { beforeEach, describe, expect, it } from 'vitest'
import { discardDraft, draftDocs, draftEntries, dropDraft, hasDraft, patchDraft, putDraft, startDraft, stopDraft } from './draft'

const mem = new Map<string, string>()
Object.assign(globalThis, {
  localStorage: {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  },
})

beforeEach(() => {
  stopDraft()
  mem.clear()
})

describe('чернетка', () => {
  it('поза режимом чернетки нічого не пише', () => {
    putDraft('class_groups', 'a', { grade: 5 })
    expect(draftDocs('class_groups')).toEqual([])
    expect(hasDraft('u')).toBe(false)
  })

  it('зберігає документи й відновлює їх після перезапуску', () => {
    startDraft('u')
    putDraft('class_groups', 'a', { grade: 5 })
    patchDraft('class_groups', 'a', { letter: 'А' })
    expect(hasDraft('u')).toBe(true)
    stopDraft()
    startDraft('u')
    expect(draftDocs('class_groups')).toEqual([{ id: 'a', grade: 5, letter: 'А' }])
    expect(draftEntries()).toEqual([['class_groups', 'a', { grade: 5, letter: 'А' }]])
  })

  it('видалення прибирає документ, а patch не створює відсутній', () => {
    startDraft('u')
    putDraft('periods', 'p', { title: 'І' })
    patchDraft('periods', 'x', { title: 'нема' })
    dropDraft('periods', 'p')
    expect(draftDocs('periods')).toEqual([])
  })

  it('discardDraft стирає збережене', () => {
    startDraft('u')
    putDraft('periods', 'p', { title: 'І' })
    stopDraft()
    discardDraft('u')
    expect(hasDraft('u')).toBe(false)
  })
})
