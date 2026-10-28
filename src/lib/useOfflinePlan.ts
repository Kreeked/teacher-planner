import { useEffect, useMemo, useState } from 'react'
import { useCollection } from '../data/db'
import { offlinePlan } from '../data/offline'
import { toISO } from '../data/schedule'
import { savedSizes, syncOffline, useOfflineFiles } from './offlineFiles'
import { useOnline } from './useOnline'

/** Що має бути на пристрої і чого з цього ще бракує. */
export function useOfflinePlan() {
  const files = useOfflineFiles()
  const { items: materials, loading: l1 } = useCollection('lesson_materials')
  const { items: schedules, loading: l2 } = useCollection('lesson_schedules')
  const { items: lessons, loading: l3 } = useCollection('lessons')
  const [today] = useState(() => toISO(new Date()))
  const sizes = useMemo(() => savedSizes(files), [files])
  const plan = useMemo(
    () => offlinePlan(materials, schedules, lessons, today, sizes),
    [materials, schedules, lessons, today, sizes],
  )
  const missing = plan.keep.filter((x) => !files.saved.has(x.material.drive_file_id!))
  const loading = l1 || l2 || l3 || !files.ready
  return { plan, files, missing, loading, hasMaterials: materials.length > 0 }
}

/** Тихо оновлює офлайн-копії, коли змінюються уроки чи матеріали і доступ до Диска вже є. */
export function useOfflineAutoSync() {
  const { plan, loading, hasMaterials } = useOfflinePlan()
  const online = useOnline()
  const ids = plan.keep.map((x) => x.material.drive_file_id).join('|')

  useEffect(() => {
    // Порожній список матеріалів може бути збоєм читання — тоді нічого не видаляємо.
    if (loading || !hasMaterials) return
    const t = setTimeout(
      () =>
        syncOffline(
          plan.keep.map((x) => x.material),
          false,
        ),
      2000,
    )
    return () => clearTimeout(t)
    // plan змінюється разом з ids; інші поля не важливі.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids, loading, hasMaterials, online])
}
