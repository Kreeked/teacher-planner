import {
  ChevronLeft,
  ChevronRight,
  Columns2,
  ExternalLink,
  Maximize,
  Minimize,
  Presentation,
  RefreshCw,
  ScrollText,
  X,
} from 'lucide-react'
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist'
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { PdfScroll } from './PdfScroll'
import { PdfSlide } from './PdfSlide'

export type ViewMode = 'slide' | 'scroll' | 'spread'

type Props = {
  title: string
  /** PDF файлу; fresh — взяти з Диска наново, а не збережену копію. */
  load: (fresh: boolean) => Promise<Blob>
  google: { url: string; label: string }
  /** Як показувати спочатку: презентації — слайдами, решту — прокруткою. */
  mode: ViewMode
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

// Телефон і планшет без миші: панель завжди видима й не перекриває файл.
const COMPACT = '(max-width: 760px), (hover: none)'
function useCompact() {
  return useSyncExternalStore(
    (l) => {
      const mq = matchMedia(COMPACT)
      mq.addEventListener('change', l)
      return () => mq.removeEventListener('change', l)
    },
    () => matchMedia(COMPACT).matches,
  )
}

const MODES: { value: ViewMode; label: string; icon: typeof Presentation }[] = [
  { value: 'slide', label: 'Слайди: одна сторінка на екрані', icon: Presentation },
  { value: 'scroll', label: 'Прокрутка зверху вниз', icon: ScrollText },
  { value: 'spread', label: 'Дві сторінки на екрані', icon: Columns2 },
]

/**
 * Перегляд PDF на весь екран: слайдами (стрілки, пробіл, дотик, свайп), суцільною прокруткою або по дві сторінки.
 * На ПК панель з'являється лише від руху миші й ховається, коли нею не користуються; на телефоні вона завжди зверху.
 * Екран не гасне, поки перегляд відкрито.
 */
export function FileViewer({ title, load, google, mode: initialMode, onClose }: Props) {
  const root = useRef<HTMLDivElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const taskRef = useRef<PDFDocumentLoadingTask | null>(null)
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null)
  const [page, setPage] = useState(1)
  const [chosen, setMode] = useState(initialMode)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(true)
  const [bar, setBar] = useState(true)
  const [full, setFull] = useState(false)
  const barTimer = useRef(0)
  const compact = useCompact()
  const pages = doc?.numPages ?? 0
  // Дві сторінки поруч на вузькому екрані нечитабельні.
  const mode: ViewMode = compact && chosen === 'spread' ? 'scroll' : chosen
  const shown = compact || bar

  const hideBar = useCallback(() => {
    window.clearTimeout(barTimer.current)
    barTimer.current = window.setTimeout(() => setBar(false), BAR_MS)
  }, [])
  // Панель показує лише рух миші (як у відео), клавіатура її не будить.
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
      const el = scroller.current
      if (mode !== 'slide' && el) {
        // Прокрутка: стрілки по рядку, решта — майже на екран.
        const screen = el.clientHeight * 0.9
        if (e.key === 'ArrowDown') el.scrollBy({ top: 80 })
        else if (e.key === 'ArrowUp') el.scrollBy({ top: -80 })
        else if (next.includes(e.key)) el.scrollBy({ top: screen })
        else if (prev.includes(e.key)) el.scrollBy({ top: -screen })
        else if (e.key === 'Home') el.scrollTo({ top: 0 })
        else if (e.key === 'End') el.scrollTo({ top: el.scrollHeight })
        else if (!['f', 'F', 'а', 'А', 'Escape'].includes(e.key)) return
      }
      if (mode === 'slide') {
        if (next.includes(e.key)) step(1)
        else if (prev.includes(e.key)) step(-1)
        else if (e.key === 'Home') go(1)
        else if (e.key === 'End') go(pages)
        else if (!['f', 'F', 'а', 'А', 'Escape'].includes(e.key)) return
      }
      if (e.key === 'f' || e.key === 'F' || e.key === 'а' || e.key === 'А') toggleFull()
      else if (e.key === 'Escape') onClose()
      e.preventDefault()
      e.stopPropagation()
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [mode, step, go, pages, toggleFull, onClose])

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

  const refresh = () => {
    setLoading(true)
    setNote('')
    fetchDoc(true)
  }

  const googleLink = compact ? (
    <a className="icon-btn" href={google.url} target="_blank" rel="noreferrer" aria-label={google.label} title={google.label}>
      <ExternalLink size={16} />
    </a>
  ) : (
    <a className="btn ghost small" href={google.url} target="_blank" rel="noreferrer">
      <ExternalLink size={14} aria-hidden /> {google.label}
    </a>
  )

  return createPortal(
    <div
      ref={root}
      className={['viewer', compact && 'compact', shown && 'bar-on'].filter(Boolean).join(' ')}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onPointerMove={(e) => !compact && e.pointerType === 'mouse' && wake()}
    >
      <div className="viewer-bar" onPointerEnter={() => window.clearTimeout(barTimer.current)} onPointerLeave={() => !compact && wake()}>
        <b className="grow" title={title}>
          {title}
        </b>
        {note && <span className="viewer-note">{note}</span>}
        <div className="viewer-tools">
          {!compact && googleLink}
          <span className="viewer-modes" role="group" aria-label="Режим перегляду">
            {MODES.filter((m) => !(compact && m.value === 'spread')).map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                className="icon-btn"
                aria-pressed={mode === value}
                aria-label={label}
                title={label}
                onClick={() => setMode(value)}
              >
                <Icon size={16} />
              </button>
            ))}
          </span>
          {pages > 0 && (
            <span className="viewer-pager">
              <button type="button" className="icon-btn" onClick={() => step(-1)} disabled={page <= 1} aria-label="Назад">
                <ChevronLeft size={18} />
              </button>
              <span className="viewer-count">
                {page} / {pages}
              </span>
              <button type="button" className="icon-btn" onClick={() => step(1)} disabled={page >= pages} aria-label="Далі">
                <ChevronRight size={18} />
              </button>
            </span>
          )}
          <button type="button" className="icon-btn" onClick={refresh} disabled={loading} aria-label="Оновити з Диска" title="Оновити з Диска">
            <RefreshCw size={16} className={loading ? 'spin' : undefined} />
          </button>
          {compact && googleLink}
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
        </div>
        <button type="button" className="icon-btn viewer-close" onClick={onClose} aria-label="Закрити" title="Закрити (Esc)">
          <X size={18} />
        </button>
      </div>

      {doc && mode === 'slide' && <PdfSlide doc={doc} page={page} onStep={step} />}
      {doc && mode !== 'slide' && (
        <PdfScroll key={mode} doc={doc} cols={mode === 'spread' ? 2 : 1} page={page} onPage={setPage} scroller={scroller} />
      )}
      {!doc && (
        <div className="viewer-stage">
          {error ? (
            <div className="viewer-msg" role="alert">
              {error}
              <button type="button" className="btn ghost small" onClick={refresh}>
                Спробувати ще
              </button>
            </div>
          ) : (
            <div className="viewer-msg">
              <RefreshCw size={20} className="spin" aria-hidden />
              Готую файл…
            </div>
          )}
        </div>
      )}
    </div>,
    document.body,
  )
}
