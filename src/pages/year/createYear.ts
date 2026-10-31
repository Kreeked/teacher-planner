import { commit, createDoc, newBatch } from '../../data/db'
import { defaultYear } from '../../data/year'
import { syncVacations } from './vacations'

/** Створює навчальний рік і, за бажанням, два типові семестри, підігнані під його дати, та канікули при них. */
export function createYear(v: { title: string; start: string; end: string; withSemesters: boolean; blank?: boolean }) {
  const batch = newBatch()
  const yearId = createDoc('academic_years', { title: v.title.trim(), start_date: v.start, end_date: v.end }, batch)
  if (v.withSemesters) {
    const tpl = defaultYear(Number(v.start.slice(0, 4))).semesters
    const semesters = tpl.map((s, i) => ({
      academic_year_id: yearId,
      parent_id: null,
      kind: 'semester' as const,
      title: s.title,
      // У `blank` межі семестрів порожні, крім збігів з межами року: решту вкаже користувач.
      start_date: i === 0 ? v.start : v.blank ? '' : s.start_date,
      end_date: i === tpl.length - 1 ? v.end : v.blank ? '' : s.end_date,
      position: i,
    }))
    for (const s of semesters) createDoc('periods', s, batch)
    if (!v.blank) syncVacations(yearId, semesters, [], batch)
  }
  commit(batch)
  return yearId
}
