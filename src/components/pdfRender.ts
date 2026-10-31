import type { PDFPageProxy } from 'pdfjs-dist'

/**
 * Малює сторінку в canvas масштабом scale (у CSS-пікселях) і повертає готовий кадр:
 * спершу «за лаштунками», щоб на екрані не було порожнього білого кадру.
 * cancel скасовує малювання.
 */
export function paint(page: PDFPageProxy, scale: number) {
  const dpr = window.devicePixelRatio || 1
  const viewport = page.getViewport({ scale: scale * dpr })
  const off = document.createElement('canvas')
  off.width = Math.max(1, Math.floor(viewport.width))
  off.height = Math.max(1, Math.floor(viewport.height))
  const task = page.render({ canvas: off, viewport })
  return {
    done: task.promise.then(() => ({ canvas: off, css: { w: off.width / dpr, h: off.height / dpr } })),
    cancel: () => task.cancel(),
  }
}

/** Переносить готовий кадр у видимий canvas одним кроком. */
export function show(view: HTMLCanvasElement, frame: { canvas: HTMLCanvasElement; css: { w: number; h: number } }) {
  view.width = frame.canvas.width
  view.height = frame.canvas.height
  view.style.width = `${frame.css.w}px`
  view.style.height = `${frame.css.h}px`
  view.getContext('2d')?.drawImage(frame.canvas, 0, 0)
}

export const isCancel = (e: unknown) => (e as { name?: string })?.name === 'RenderingCancelledException'
