import { describe, expect, it } from 'vitest'
import { followSemesters } from './timetable'
import type { Period, Timetable } from './types'

const sem = (id: string, start_date: string, end_date: string, parent_id: string | null = null) =>
  ({ id, start_date, end_date, parent_id }) as Period
const tt = (id: string, period_id: string | null, valid_from: string, valid_to: string) =>
  ({ id, period_id, valid_from, valid_to }) as Timetable

describe('followSemesters', () => {
  it('розклад семестру отримує дати семестру', () => {
    const [t] = followSemesters([tt('a', 's1', '2026-09-01', '2026-12-26')], [sem('s1', '2026-09-01', '2026-12-19')])
    expect([t.valid_from, t.valid_to]).toEqual(['2026-09-01', '2026-12-19'])
  })

  it('розклад без семестру чи з видаленим семестром лишає свої дати', () => {
    const list = [tt('a', null, '2026-09-01', '2027-06-30'), tt('b', 'gone', '2026-09-01', '2026-12-19')]
    expect(followSemesters(list, [sem('s1', '2026-09-01', '2026-12-19')])).toEqual(list)
  })

  it('чверть не рахується семестром, а порожні дати не затирають розклад', () => {
    const list = [tt('a', 'q', '2026-09-01', '2026-12-19'), tt('b', 's2', '2027-01-12', '2027-06-30')]
    const out = followSemesters(list, [sem('q', '2026-09-01', '2026-10-30', 's1'), sem('s2', '', '')])
    expect(out).toEqual(list)
  })
})
