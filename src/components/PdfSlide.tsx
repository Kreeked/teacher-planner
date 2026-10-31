import type { PDFDocumentProxy } from 'pdfjs-dist'
import { useEffect, useRef, useState } from 'react'
import { isCancel, paint, show } from './pdfRender'

type Props = { doc: PDFDocumentProxy; page: number; onStep: (d: number) => void }

/** Одна сторінка на весь екран, вписана за розміром, як слайд. Дотик: ліва третина — назад, решта — далі; свайп гортає. */
export function PdfSlide({ doc, page, onStep }: Props) {
  const stage = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })

  useEffect(() => {
    const el = stage.current
    if (!el) return
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (!size.w || !size.h) return
    let cancelled = false
    let cancel: (() => void) | undefined
    ;(async () => {
      const p = await doc.getPage(page)
      const base = p.getViewport({ scale: 1 })
      const job = paint(p, Math.min(size.w / base.width, size.h / base.height))
      cancel = job.cancel
      const frame = await job.done
      if (cancelled || !canvas.current) return
      show(canvas.current, frame)
      if (page < doc.numPages) doc.getPage(page + 1).catch(() => {})
    })().catch((e) => isCancel(e) || console.error(e))
    return () => {
      cancelled = true
      cancel?.()
    }
  }, [doc, page, size])

  const down = useRef<{ x: number; y: number } | null>(null)
  function pointerUp(e: React.PointerEvent) {
    const d = down.current
    down.current = null
    if (!d) return
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) return onStep(dx < 0 ? 1 : -1)
    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) return
    const rect = e.currentTarget.getBoundingClientRect()
    onStep(e.clientX - rect.left < rect.width * 0.3 ? -1 : 1)
  }

  return (
    <div
      ref={stage}
      className="viewer-stage"
      onPointerDown={(e) => (down.current = { x: e.clientX, y: e.clientY })}
      onPointerUp={pointerUp}
      onPointerCancel={() => (down.current = null)}
    >
      <canvas ref={canvas} />
    </div>
  )
}
