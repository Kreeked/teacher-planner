export type Ask = { text: string; ok: string; danger: boolean; resolve: (yes: boolean) => void }

let show: ((a: Ask) => void) | null = null

/** Підключає вікно підтвердження (ConfirmHost); повертає функцію відключення. */
export function registerConfirm(fn: (a: Ask) => void) {
  show = fn
  return () => {
    show = null
  }
}

/**
 * Питання «так/ні» у вікні застосунку замість системного confirm().
 * ok — напис головної кнопки; danger — червона кнопка для видалення.
 */
export function ask(text: string, { ok = 'Видалити', danger = true } = {}): Promise<boolean> {
  return new Promise((resolve) => {
    if (show) show({ text, ok, danger, resolve })
    else resolve(confirm(text))
  })
}
