import { flash } from './flash'

// Скільки після появи елемента сторінка ще може добудовуватися (дані, шрифти) і зсувати його.
const SETTLE_MS = 800

/**
 * Ставить елемент посередині екрана й підсвічує. Поки сторінка добудовується, тримає його на місці,
 * а щойно користувач сам почав прокручувати — не заважає.
 */
export function reveal(el: HTMLElement) {
  const offset = () => {
    const r = el.getBoundingClientRect()
    return r.top + r.height / 2 - window.innerHeight / 2
  }
  window.scrollTo(0, Math.max(0, window.scrollY + offset()))
  flash(el)

  const stop = () => {
    done = true
    for (const type of INPUT) window.removeEventListener(type, stop)
  }
  let done = false
  const INPUT = ['wheel', 'touchstart', 'keydown', 'pointerdown']
  for (const type of INPUT) window.addEventListener(type, stop, { passive: true })

  const end = performance.now() + SETTLE_MS
  const hold = () => {
    if (done) return
    // Розділ приховано (перейшли в інший): тримати нічого, інакше прокрутка поїде за нульовим прямокутником.
    if (!el.isConnected || el.offsetParent === null || performance.now() > end) return stop()
    const d = offset()
    if (Math.abs(d) > 1) window.scrollBy(0, d)
    requestAnimationFrame(hold)
  }
  requestAnimationFrame(hold)
}
