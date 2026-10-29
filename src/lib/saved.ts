let ping: (() => void) | null = null

/** Підключає позначку «Збережено» (SavedToast); повертає функцію відключення. */
export function registerSaved(fn: () => void) {
  ping = fn
  return () => {
    ping = null
  }
}

/** Коротко показує «Збережено» після запису поля, що зберігається саме, без кнопки. */
export function notifySaved() {
  ping?.()
}
