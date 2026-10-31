import { useCollection } from '../../data/db'
import type { AcademicYear } from '../../data/types'

/** Усе, що належить навчальному року: семестри, класи, предмети, дзвінки й розклад. */
export function useYearData(year: AcademicYear | undefined) {
  const filter = year ? { field: 'academic_year_id', value: year.id } : null
  const { items: periods } = useCollection('periods', filter)
  const { items: classes } = useCollection('class_groups', filter)
  const { items: daysOff } = useCollection('days_off', filter)
  const { items: bells } = useCollection('bell_schedules', filter)
  const { items: timetables } = useCollection('timetables', filter)
  const { items: courses } = useCollection('courses', filter)
  const { items: allEntries } = useCollection('timetable_entries')
  const { items: allLinks } = useCollection('course_classes')

  return {
    periods,
    classes,
    daysOff,
    bells,
    timetables,
    courses,
    links: allLinks.filter((l) => courses.some((c) => c.id === l.course_id)),
    entries: allEntries.filter((e) => timetables.some((t) => t.id === e.timetable_id)),
  }
}
