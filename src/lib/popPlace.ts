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

/**
 * Список під полем, а якщо внизу мало місця — над ним. Якщо не вміщується ні там, ні там, він стає з боку, де місця більше,
 * і скорочується (maxHeight), але ніколи не накриває саме поле.
 */
export function placeBelowOrAbove(r: DOMRect, height: number): { top: number; maxHeight?: number } {
  const edge = freeEdges()
  const below = edge.bottom - 8 - (r.bottom + 4)
  const above = r.top - 4 - (edge.top + 8)
  if (height <= below) return { top: r.bottom + 4 }
  if (height <= above) return { top: r.top - 4 - height }
  if (below >= above) return { top: r.bottom + 4, maxHeight: Math.max(0, below) }
  return { top: edge.top + 8, maxHeight: Math.max(0, above) }
}
