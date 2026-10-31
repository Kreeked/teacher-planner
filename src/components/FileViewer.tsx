import { ChevronLeft, ChevronRight, ExternalLink, Maximize, Minimize, RefreshCw, X } from 'lucide-react'
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

type Props = {
  title: string
  /** PDF файлу; fresh — взяти з Диска наново, а не збережену копію. */
  load: (fresh: boolean) => Promise<Blob>
  google: { url: string; label: string }
  onClose: () => void
}

let pdfjs: Promise<typeof import('pdfjs-dist')> | undefined

/** pdf.js вантажиться лише при першому перегляді; його воркер потрапляє в офлайн-кеш застосунку. */
function loadPdfjs() {
  pdfjs ??= Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]).then(([lib, worker]) => {
    lib.GlobalWorkerOptions.workerSrc = worker.default
    return lib
  })
  return pdfjs
}

const BAR_MS = 3000

/**
 * Перегляд PDF на весь екран, сторінка за сторінкою, як показ слайдів: стрілки, пробіл, дотик (ліва третина — назад,
 * решта — далі), свайп. Панель угорі ховається, коли нею не користуються. Екран не гасне, поки перегляд відкрито.
 */
export function FileViewer({ title, load, google, onClose }: Props) {
  const root = useRef<HTMLDivElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const taskRef = useRef<PDFDocumentLoadingTask | null>(null)
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null)
  const [page, setPage] = useState(1)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(true)
  const [bar, setBar] = useState(true)
  const [full, setFull] = useState(false)
  const barTimer = useRef(0)
  const pages = doc?.numPages ?? 0

  const hideBar = useCallback(() => {
    window.clearTimeout(barTimer.current)
    barTimer.current = window.setTimeout(() => setBar(false), BAR_MS)
  }, [])
  const wake = useCallback(() => {
    setBar(true)
    hideBar()
  }, [hideBar])
  useEffect(() => {
    hideBar()
    return () => window.clearTimeout(barTimer.current)
  }, [hideBar])

  // Відкриття й оновлення файлу. Якщо оновити не вдалося, лишається те, що вже на екрані.
  const alive = useRef(true)
  // Останній load без перезапуску ефекту: інакше кожне оновлення батька завантажувало б файл знову.
  const loader = useRef(load)
  useEffect(() => {
    loader.current = load
  })
  const fetchDoc = useCallback(async (fresh: boolean) => {
    try {
      const blob = await loader.current(fresh)
      const lib = await loadPdfjs()
      const task = lib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) })
      const next = await task.promise
      if (!alive.current) return void task.destroy()
      taskRef.current?.destroy()
      taskRef.current = task
      setDoc(next)
      setPage((p) => Math.min(p, next.numPages))
      setError('')
    } catch (e) {
      console.error(e)
      const text = e instanceof Error && e.message ? e.message : 'Не вдалося відкрити файл.'
      if (taskRef.current) setNote(text)
      else setError(text)
    } finally {
      if (alive.current) setLoading(false)
    }
  }, [])
  useEffect(() => {
    alive.current = true
    fetchDoc(false)
    return () => {
      alive.current = false
      taskRef.current?.destroy()
      taskRef.current = null
    }
  }, [fetchDoc])

  // Розмір сцени.
  useEffect(() => {
    const el = stage.current
    if (!el) return
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Малюємо сторінку «за лаштунками» й підміняємо одразу, щоб між слайдами не блимав білий кадр.
  useEffect(() => {
    if (!doc || !size.w || !size.h) return
    let cancelled = false
    let cancel: (() => void) | undefined
    ;(async () => {
      const p = await doc.getPage(page)
      const base = p.getViewport({ scale: 1 })
      const dpr = window.devicePixelRatio || 1
      const fit = Math.min(size.w / base.width, size.h / base.height)
      const viewport = p.getViewport({ scale: fit * dpr })
      const off = document.createElement('canvas')
      off.width = Math.floor(viewport.width)
      off.height = Math.floor(viewport.height)
      const task = p.render({ canvas: off, viewport })
      cancel = () => task.cancel()
      await task.promise
      const view = canvas.current
      if (cancelled || !view) return
      view.width = off.width
      view.height = off.height
      view.style.width = `${off.width / dpr}px`
      view.style.height = `${off.height / dpr}px`
      view.getContext('2d')?.drawImage(off, 0, 0)
      if (page < doc.numPages) doc.getPage(page + 1).catch(() => {})
    })().catch((e) => {
      if (e?.name !== 'RenderingCancelledException') console.error(e)
    })
    return () => {
      cancelled = true
      cancel?.()
    }
  }, [doc, page, size])

  const go = useCallback((to: number) => setPage(Math.max(1, Math.min(pages || 1, to))), [pages])
  const step = useCallback((d: number) => setPage((p) => Math.max(1, Math.min(pages || 1, p + d))), [pages])

  const toggleFull = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    else root.current?.requestFullscreen?.().catch(() => {})
  }, [])
  useEffect(() => {
    const change = () => setFull(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', change)
    return () => {
      document.removeEventListener('fullscreenchange', change)
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    }
  }, [])

  // Клавіатура й кліпер. Слухаємо у фазі перехоплення, щоб вікно матеріалів під переглядом не закрилось від Escape.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const next = ['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter']
      const prev = ['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace']
      if (next.includes(e.key)) step(1)
      else if (prev.includes(e.key)) step(-1)
      else if (e.key === 'Home') go(1)
      else if (e.key === 'End') go(pages)
      else if (e.key === 'f' || e.key === 'F' || e.key === 'а' || e.key === 'А') toggleFull()
      else if (e.key === 'Escape') onClose()
      else return
      e.preventDefault()
      e.stopPropagation()
      wake()
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [step, go, pages, toggleFull, onClose, wake])

  // Екран не гасне, поки йде показ.
  useEffect(() => {
    let lock: WakeLockSentinel | undefined
    const request = () => navigator.wakeLock?.request('screen').then((l) => (lock = l)).catch(() => {})
    const visible = () => document.visibilityState === 'visible' && request()
    request()
    document.addEventListener('visibilitychange', visible)
    return () => {
      document.removeEventListener('visibilitychange', visible)
      lock?.release().catch(() => {})
    }
  }, [])

  // Сторінка під переглядом не прокручується.
  useEffect(() => {
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = overflow
    }
  }, [])

  // Дотик: ліва третина — назад, решта — далі, свайп гортає, верхній край показує панель.
  const down = useRef<{ x: number; y: number } | null>(null)
  function pointerUp(e: React.PointerEvent) {
    const d = down.current
    down.current = null
    if (!d || !doc) return
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) return step(dx < 0 ? 1 : -1)
    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) return
    const rect = e.currentTarget.getBoundingClientRect()
    if (e.clientY - rect.top < 56) return wake()
    step(e.clientX - rect.left < rect.width * 0.3 ? -1 : 1)
  }

  const refresh = () => {
    wake()
    setLoading(true)
    setNote('')
    fetchDoc(true)
  }

  return createPortal(
    <div
      ref={root}
      className={bar ? 'viewer bar-on' : 'viewer'}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onPointerMove={(e) => e.pointerType === 'mouse' && wake()}
    >
      <div className="viewer-bar" onPointerEnter={() => window.clearTimeout(barTimer.current)} onPointerLeave={wake}>
        <b className="grow" title={title}>
          {title}
        </b>
        {note && <span className="viewer-note">{note}</span>}
        <a className="btn ghost small" href={google.url} target="_blank" rel="noreferrer">
          <ExternalLink size={14} aria-hidden /> {google.label}
        </a>
        {pages > 0 && (
          <>
            <button type="button" className="icon-btn" onClick={() => step(-1)} disabled={page <= 1} aria-label="Назад">
              <ChevronLeft size={18} />
            </button>
            <span className="viewer-count">
              {page} / {pages}
            </span>
            <button type="button" className="icon-btn" onClick={() => step(1)} disabled={page >= pages} aria-label="Далі">
              <ChevronRight size={18} />
            </button>
          </>
        )}
        <button type="button" className="icon-btn" onClick={refresh} disabled={loading} aria-label="Оновити з Диска" title="Оновити з Диска">
          <RefreshCw size={16} className={loading ? 'spin' : undefined} />
        </button>
        {document.fullscreenEnabled && (
          <button
            type="button"
            className="icon-btn"
            onClick={toggleFull}
            aria-label={full ? 'Вийти з повного екрана' : 'На весь екран'}
            title={full ? 'Вийти з повного екрана (F)' : 'На весь екран (F)'}
          >
            {full ? <Minimize size={16} /> : <Maximize size={16} />}
          </button>
        )}
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Закрити" title="Закрити (Esc)">
          <X size={18} />
        </button>
      </div>

      <div
        ref={stage}
        className="viewer-stage"
        onPointerDown={(e) => (down.current = { x: e.clientX, y: e.clientY })}
        onPointerUp={pointerUp}
        onPointerCancel={() => (down.current = null)}
      >
        {doc && <canvas ref={canvas} />}
        {!doc && !error && (
          <div className="viewer-msg">
            <RefreshCw size={20} className="spin" aria-hidden />
            Готую файл…
          </div>
        )}
        {error && (
          <div className="viewer-msg" role="alert">
            {error}
            <button type="button" className="btn ghost small" onClick={refresh}>
              Спробувати ще
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
