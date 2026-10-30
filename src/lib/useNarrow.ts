import { useSyncExternalStore } from 'react'

// Той самий поріг, що й у @media телефона в index.css.
const QUERY = '(max-width: 760px)'

function subscribe(onChange: () => void) {
  const mq = window.matchMedia(QUERY)
  mq.addEventListener('change', onChange)
  return () => mq.removeEventListener('change', onChange)
}

/** Чи екран вузький, як на телефоні. */
export function useNarrow() {
  return useSyncExternalStore(subscribe, () => window.matchMedia(QUERY).matches)
}
