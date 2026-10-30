/** Коротко підсвічує елемент, щоб після прокрутки його одразу було видно. */
export function flash(el: HTMLElement) {
  el.classList.remove('flash')
  void el.offsetWidth
  el.classList.add('flash')
  el.addEventListener('animationend', () => el.classList.remove('flash'), { once: true })
}
