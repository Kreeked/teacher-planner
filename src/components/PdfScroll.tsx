import type { PDFDocumentProxy } from 'pdfjs-dist'
import { useEffect, useRef, useState, type RefObject } from 'react'
import { isCancel, paint, show } from './pdfRender'

type Props = {
  doc: PDFDocumentProxy
  /** Скільки сторінок поруч: 1 — звичайна прокрутка, 2 — дві сторінки на екрані. */
  cols: 1 | 2
  page: number
  onPage: (page: number) => void
  scroller: RefObject<HTMLDivElement | null>
}

const PAD = 16
const GAP = 12

type Dim = { w: number; h: number }

/** Одна сторінка документа: малюється, коли потрапляє в зону видимості, і звільняє пам'ять, коли далеко від неї. */
function PageBox({ doc, no, w, h, root }: { doc: PDFDocumentProxy; no: number; w: number; h: number; root: RefObject<HTMLDivElement | null> }) {
  const box = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [near, setNear] = useState(false)

  useEffect(() => {
    const el = box.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => setNear(e.isIntersecting), { root: root.current, rootMargin: '150% 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [root])

  useEffect(() => {
    const view = canvas.current
    if (!view) return
    if (!near) {
      view.width = 0
      return
    }
    let cancelled = false
    let cancel: (() => void) | undefined
    ;(async () => {
      const p = await doc.getPage(no)
      const job = paint(p, w / p.getViewport({ scale: 1 }).width)
      cancel = job.cancel
      const frame = await job.done
      if (!cancelled) show(view, frame)
    })().catch((e) => isCancel(e) || console.error(e))
    return () => {
      cancelled = true
      cancel?.()
    }
  }, [near, doc, no, w])

  return (
    <div ref={box} className="viewer-page" style={{ width: w, height: h }}>
      <canvas ref={canvas} />
    </div>
  )
}

/** Документ суцільною стрічкою зверху вниз; у режимі «дві сторінки» — у два стовпці. Сторінки вписуються за шириною. */
export function PdfScroll({ doc, cols, page, onPage, scroller }: Props) {
  const grid = useRef<HTMLDivElement>(null)
  const [dims, setDims] = useState<Dim[]>([])
  const [width, setWidth] = useState(0)
  const current = useRef(1)

  useEffect(() => {
    let cancelled = false
    Promise.all(
      Array.from({ length: doc.numPages }, (_, i) =>
        doc.getPage(i + 1).then((p) => {
          const v = p.getViewport({ scale: 1 })
          return { w: v.width, h: v.height }
        }),
      ),
    )
      .then((d) => !cancelled && setDims(d))
      .catch(console.error)
    return () => {
      cancelled = true
    }
  }, [doc])

  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const measure = () => setWidth(el.clientWidth)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [scroller])

  const colW = Math.max(120, Math.min((width - 2 * PAD - GAP * (cols - 1)) / cols, cols === 1 ? 1000 : 900))

  // Яка сторінка зараз угорі — для лічильника.
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    let raf = 0
    const onScroll = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const items = grid.current?.children
        if (!items) return
        const line = el.scrollTop + el.clientHeight * 0.3
        let at = 0
        for (let i = 0; i < items.length; i++) if ((items[i] as HTMLElement).offsetTop <= line) at = i
        at -= at % cols // у два стовпці — перша сторінка рядка
        if (at + 1 !== current.current) {
          current.current = at + 1
          onPage(at + 1)
        }
      })
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      el.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(raf)
    }
  }, [scroller, onPage, cols])

  // Перехід на сторінку, обрану не прокруткою (кнопки, перемикання режиму).
  useEffect(() => {
    const el = scroller.current
    const item = grid.current?.children[page - 1] as HTMLElement | undefined
    if (!el || !item || page === current.current) return
    current.current = page
    el.scrollTo({ top: item.offsetTop - PAD })
  }, [page, dims, colW, scroller])

  return (
    <div ref={scroller} className="viewer-scroll">
      <div ref={grid} className="viewer-pages" style={{ gridTemplateColumns: `repeat(${cols}, ${colW}px)`, gap: GAP, padding: PAD }}>
        {dims.map((d, i) => (
          <PageBox key={i} doc={doc} no={i + 1} w={colW} h={Math.round((colW * d.h) / d.w)} root={scroller} />
        ))}
      </div>
    </div>
  )
}
