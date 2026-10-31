/** Ховає заставку з index.html: плавно зникає, а потім прибирається з розмітки. */
export function hideSplash() {
  const el = document.getElementById('splash')
  if (!el || el.classList.contains('hide')) return
  el.classList.add('hide')
  setTimeout(() => el.remove(), 500)
}
