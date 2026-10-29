import { useEffect, useRef } from 'react'
import { BatchWriter, updateFields } from '../data/db'
import { classifyLegacy } from '../data/materials'
import type { LessonMaterial } from '../data/types'

/**
 * Один раз розкладає старі файли уроків (без типу) по поличках: презентації — у «Презентацію»,
 * решта — у «Без типу». Повторно не спрацьовує: після запису поле category вже є.
 */
export function useClassifyLegacy(materials: LessonMaterial[]) {
  const done = useRef(new Set<string>())
  useEffect(() => {
    const patches = classifyLegacy(materials).filter((p) => !done.current.has(p.id))
    if (!patches.length) return
    const writer = new BatchWriter()
    for (const { id, ...patch } of patches) {
      done.current.add(id)
      updateFields('lesson_materials', id, patch, writer.batch)
    }
    writer.commit()
  }, [materials])
}
