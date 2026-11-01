/** Закріплені панелі онбордингу на телефоні (степер угорі, кнопки внизу): список не має заходити під них. */
const PINNED = '.ob-stepper, .ob-nav'

/** Смуга екрана, вільна від закріплених панелей. */
function freeEdges() {
  let top = 0
  let bottom = window.innerHeight
  for (const el of document.querySelectorAll<HTMLElement>(PINNED)) {
    const position = getComputedStyle(el).position
    if (position !== 'fixed' && position !== 'sticky') continue
    const r = el.getBoundingClientRect()
    if (r.top <= 0 && r.bottom > 0) top = Math.max(top, r.bottom)
    else if (r.bottom >= window.innerHeight && r.top < bottom) bottom = r.top
  }
  return { top, bottom }
}

export type PopY = { top?: number; bottom?: number; maxHeight?: number }

/**
 * Список під полем, а якщо внизу мало місця — над ним. Якщо не вміщується ні там, ні там, він стає з боку, де місця більше,
 * і скорочується (maxHeight), але ніколи не накриває саме поле.
 * Над полем список прив'язано нижнім краєм (bottom), а не верхнім: тоді зазор до поля завжди 4 px, хоч яка реальна висота.
 */
export function placeBelowOrAbove(r: DOMRect, height: number): PopY {
  const edge = freeEdges()
  const below = edge.bottom - 8 - (r.bottom + 4)
  const above = r.top - 4 - (edge.top + 8)
  if (height <= below) return { top: r.bottom + 4 }
  if (height <= above) return { bottom: window.innerHeight - r.top + 4 }
  if (below >= above) return { top: r.bottom + 4, maxHeight: Math.max(0, below) }
  return { top: edge.top + 8, maxHeight: Math.max(0, above) }
}

/**
 * Лівий край списку шириною `width`: збігається з лівим (start) або правим (end) краєм поля.
 * Якщо з того боку не вміщується в екран — дзеркально від протилежного краю поля; лише коли не влазить ніяк — притискається до краю екрана.
 */
export function placeX(r: DOMRect, width: number, align: 'start' | 'end' = 'start'): number {
  const max = window.innerWidth - width - 8
  const fromStart = r.left
  const fromEnd = r.right - width
  const [first, second] = align === 'start' ? [fromStart, fromEnd] : [fromEnd, fromStart]
  const fits = (x: number) => x >= 8 && x <= max
  if (fits(first)) return first
  if (fits(second)) return second
  return Math.max(8, Math.min(first, max))
}
