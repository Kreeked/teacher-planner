import { useCollection } from './db'
import { followSemesters } from './timetable'

/** Розклади (за роком чи всі) з датами, що йдуть за своїми семестрами. */
export function useTimetables(filter?: { field: string; value: string } | null) {
  const { items, loading } = useCollection('timetables', filter)
  const { items: periods, loading: pl } = useCollection('periods', filter)
  return { items: followSemesters(items, periods), loading: loading || pl }
}
