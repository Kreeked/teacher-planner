export type Ask = { text: string; ok: string; danger: boolean; word?: string; title?: string; cancel?: string; resolve: (yes: boolean) => void }

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
 * ok — напис головної кнопки; danger — червона кнопка для видалення;
 * word — слово, яке треба вписати, щоб підтвердити (для незворотних видалень року чи КТП);
 * title і cancel — заголовок вікна й напис кнопки відмови, коли «Підтвердження» і «Скасувати» не підходять.
 */
export function ask(
  text: string,
  { ok = 'Видалити', danger = true, word, title, cancel }: { ok?: string; danger?: boolean; word?: string; title?: string; cancel?: string } = {},
): Promise<boolean> {
  return new Promise((resolve) => {
    if (show) show({ text, ok, danger, word, title, cancel, resolve })
    else resolve(confirm(text))
  })
}
