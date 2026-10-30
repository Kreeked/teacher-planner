/** Коротко підсвічує елемент, щоб після прокрутки його одразу було видно. */
export function flash(el: HTMLElement) {
  el.classList.remove('flash')
  void el.offsetWidth
  el.classList.add('flash')
  // Прибираємо клас у будь-якому разі: якщо сторінку приховано посеред анімації (перемикання розділу),
  // animationend не настане, і підсвітка спалахнула б знову, коли розділ покажуть.
  const off = () => {
    el.classList.remove('flash')
    el.removeEventListener('animationend', off)
    el.removeEventListener('animationcancel', off)
    clearTimeout(timer)
  }
  const timer = setTimeout(off, 2500)
  el.addEventListener('animationend', off)
  el.addEventListener('animationcancel', off)
}
