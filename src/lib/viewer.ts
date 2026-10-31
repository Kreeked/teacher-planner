/** Який матеріал зараз відкрито у вбудованому перегляді (показує ViewerHost). */
import { useSyncExternalStore } from 'react'
import { inAppViewable, materialUrl } from '../data/materials'
import type { LessonMaterial } from '../data/types'
import { openMaterial, type SavedFile } from './offlineFiles'

let current: LessonMaterial | null = null
const listeners = new Set<() => void>()

function show(m: LessonMaterial | null) {
  current = m
  listeners.forEach((l) => l())
}

export const closeViewer = () => show(null)

export function useViewed() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => current,
  )
}

/**
 * Відкриває матеріал: презентації, документи, таблиці й PDF — у вбудованому перегляді на весь екран,
 * решту (картинки, відео, посилання, тести) — як і раніше, на Диску або з копії на пристрої.
 */
export function openFile(m: LessonMaterial, saved: SavedFile | undefined) {
  if (inAppViewable(m)) show(m)
  else openMaterial(materialUrl(m), saved)
}
