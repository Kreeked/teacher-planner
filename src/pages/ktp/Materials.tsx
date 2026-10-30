import { ask } from '../../lib/confirm'
import {
  ChevronDown,
  ClipboardList,
  Cloud,
  Download,
  File,
  FileSpreadsheet,
  FileText,
  Film,
  FolderOpen,
  House,
  Image,
  Inbox,
  Link2,
  ListChecks,
  Plus,
  Presentation,
  Shield,
  Smartphone,
  Trash2,
  Upload,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useRef, useState, type DragEvent } from 'react'
import { Dialog } from '../../components/Dialog'
import { Menu } from '../../components/Menu'
import { createDoc, removeDoc, updateFields } from '../../data/db'
import {
  CATEGORIES,
  driveFolder,
  filledShelves,
  formatSize,
  guessCategory,
  linkTitle,
  materialType,
  materialUrl,
  materialsOf,
  normalizeUrl,
  type MaterialType,
  type Shelf,
} from '../../data/materials'
import type { AcademicYear, Course, Lesson, LessonMaterial, MaterialCategory } from '../../data/types'
import { DriveError, driveConfigured, pickFiles, preloadDrive, uploadFile, type DriveFile } from '../../lib/drive'
import { openMaterial, useOfflineFiles } from '../../lib/offlineFiles'

const ICONS: Record<MaterialType, LucideIcon> = {
  slides: Presentation,
  doc: FileText,
  sheet: FileSpreadsheet,
  pdf: FileText,
  image: Image,
  video: Film,
  link: Link2,
  file: File,
}

const SHELF_ICONS: Record<Shelf, LucideIcon> = {
  slides: Presentation,
  card: ClipboardList,
  shelter: Shield,
  remote: House,
  test: ListChecks,
  none: Inbox,
}


/** Матеріал одним рядком-посиланням: іконка, назва, розмір. Без інтернету відкриває копію з пристрою. */
export function MaterialLink({ m }: { m: LessonMaterial }) {
  const Icon = ICONS[materialType(m)]
  const saved = useOfflineFiles().saved.get(m.drive_file_id ?? '')
  return (
    <a
      className="material"
      href={materialUrl(m)}
      target="_blank"
      rel="noreferrer"
      title={saved ? `${m.title} (є на пристрої)` : m.title}
      onClick={(e) => {
        // Файли Диска відкриваємо через перевірку зв'язку: без інтернету — копію з пристрою.
        if (m.kind !== 'file' || e.ctrlKey || e.metaKey || e.shiftKey) return
        e.preventDefault()
        openMaterial(materialUrl(m), saved)
      }}
    >
      <Icon size={14} />
      <span className="grow">{m.title}</span>
      {m.size_bytes ? <small>{formatSize(m.size_bytes)}</small> : null}
      {saved && <Smartphone size={12} className="saved-mark" aria-label="Є на пристрої" />}
    </a>
  )
}

/**
 * Полички уроку: лише типи, у яких є файли, і в кінці «Додати файл». Поличка з одним файлом відкриває його,
 * з кількома — вікно матеріалів. Файли «Без типу» — поличка «Інше · N», теж відкриває вікно.
 */
export function LessonShelves({ own, onOpen }: { own: LessonMaterial[]; onOpen: () => void }) {
  const saved = useOfflineFiles().saved
  return (
    <div className="shelves">
      {filledShelves(own).map(({ shelf, files }) => {
        const Icon = SHELF_ICONS[shelf]
        const n = files.length
        const category = CATEGORIES.find((c) => c.value === shelf)
        const full = category?.label ?? 'Без типу'
        const text = (
          <>
            <Icon size={12} aria-hidden />
            {category?.short ?? 'Інше'}
            {(n > 1 || !category) && ` · ${n}`}
          </>
        )
        if (n === 1 && category) {
          const m = files[0]
          const copy = saved.get(m.drive_file_id ?? '')
          return (
            <a
              key={shelf}
              className="shelf"
              href={materialUrl(m)}
              target="_blank"
              rel="noreferrer"
              title={`${full}: ${m.title}`}
              aria-label={`${full}: ${m.title}`}
              onClick={(e) => {
                if (m.kind !== 'file' || e.ctrlKey || e.metaKey || e.shiftKey) return
                e.preventDefault()
                openMaterial(materialUrl(m), copy)
              }}
            >
              {text}
            </a>
          )
        }
        return (
          <button key={shelf} type="button" className="shelf" onClick={onOpen} aria-label={`${full}: ${n}`}>
            {text}
          </button>
        )
      })}
      <button type="button" className="shelf add" onClick={onOpen}>
        <Plus size={12} aria-hidden /> Додати файл
      </button>
    </div>
  )
}


/** Вибір типу файлу: пігулка з іконкою типу; без типу — обведена «Обрати тип». */
function KindPicker({ value, onChange }: { value: MaterialCategory | null; onChange: (c: MaterialCategory) => void }) {
  const current = CATEGORIES.find((c) => c.value === value)
  const Icon = current ? SHELF_ICONS[current.value] : null
  return (
    <Menu
      label={current ? `Тип: ${current.label}` : 'Обрати тип'}
      triggerClass={current ? 'kind-btn' : 'kind-btn need'}
      trigger={
        <>
          {Icon && <Icon size={14} />}
          <span className="grow">{current?.short ?? 'Обрати тип'}</span>
          <ChevronDown size={12} className="chev" />
        </>
      }
      groups={[
        CATEGORIES.map((c) => ({
          label: c.label,
          icon: SHELF_ICONS[c.value],
          checked: c.value === value,
          onSelect: () => c.value !== value && onChange(c.value),
        })),
      ]}
    />
  )
}

type RowProps = {
  m: LessonMaterial
  onKind: (c: MaterialCategory) => void
  onRemove: () => void
}

/** Рядок матеріалу: тип, назва-посилання, «завжди на пристрої», прибрати. */
function MaterialRow({ m, onKind, onRemove }: RowProps) {
  const fresh = !m.category
  return (
    <div className={fresh ? 'mrow new' : 'mrow'}>
      <KindPicker value={m.category ?? null} onChange={onKind} />
      <div className="mname">
        <MaterialLink m={m} />
        {fresh && <small className="hint">Обери тип — і файл стане на свою поличку</small>}
      </div>
      {m.kind === 'file' ? (
        <button
          className={m.keep_offline ? 'icon-btn keep on' : 'icon-btn keep'}
          aria-pressed={m.keep_offline}
          onClick={() => updateFields('lesson_materials', m.id, { keep_offline: !m.keep_offline })}
          aria-label="Завжди мати на пристрої"
          title={
            m.keep_offline
              ? 'Завжди на пристрої. Натисни, щоб тримати лише перед уроком'
              : 'Завжди мати на пристрої, не лише в тиждень уроку'
          }
        >
          <Download size={15} />
        </button>
      ) : (
        <span />
      )}
      <button className="icon-btn del" onClick={onRemove} aria-label={`Прибрати ${m.title}`} title="Прибрати">
        <Trash2 size={15} />
      </button>
    </div>
  )
}

type DialogProps = {
  course: Course
  year?: AcademicYear
  lesson: Lesson
  materials: LessonMaterial[] // усі матеріали курсу
  onClose: () => void
}

type UploadItem = { key: number; name: string; progress: number; category: MaterialCategory | null; error?: string }

let uploadKey = 0

/**
 * Матеріали уроку: велике поле для файлів, «Щойно додані» (завантаження й файли без типу)
 * і один список матеріалів уроку, впорядкований за типами. Тип визначається за назвою файлу або обирається вручну.
 */
export function MaterialsDialog({ course, year, lesson, materials, onClose }: DialogProps) {
  const [uploads, setUploads] = useState<UploadItem[]>([])
  const [error, setError] = useState('')
  const [linkOpen, setLinkOpen] = useState(false)
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [online, setOnline] = useState(() => navigator.onLine)
  const [over, setOver] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  // Тип, обраний під час завантаження, — щоб записати файл одразу на потрібну поличку.
  const chosen = useRef(new Map<number, MaterialCategory | null>())

  useEffect(() => {
    preloadDrive()
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])

  const { own } = materialsOf(materials, lesson)
  const unsorted = own.filter((m) => !m.category)
  const sorted = CATEGORIES.flatMap((c) => own.filter((m) => m.category === c.value))
  const count = (c: MaterialCategory | null) => own.filter((m) => (m.category ?? null) === c).length
  const heading = `${lesson.extra ? 'Урок *' : `Урок ${lesson.number}`}${lesson.title ? ` «${lesson.title}»` : ''}`
  const canDrive = driveConfigured && online
  const driveProblem = !driveConfigured
    ? 'Підключення до Google Диска ще налаштовується, поки можна додавати посилання.'
    : 'Без інтернету файли не завантажуються, посилання додати можна.'

  function add(
    data: Pick<LessonMaterial, 'title' | 'kind' | 'drive_file_id' | 'url' | 'mime_type' | 'size_bytes'>,
    category: MaterialCategory | null,
    i = 0,
  ) {
    createDoc('lesson_materials', {
      course_id: course.id,
      lesson_id: lesson.id,
      topic_id: null,
      ...data,
      position: count(category) + i,
      keep_offline: false,
      category,
    })
  }

  function addDriveFile(f: DriveFile, category: MaterialCategory | null, i = 0) {
    add(
      { title: f.name, kind: 'file', drive_file_id: f.id, url: null, mime_type: f.mimeType, size_bytes: f.size },
      category,
      i,
    )
  }

  /** Новий тип — файл стає в кінець своєї полички. */
  function setKind(m: LessonMaterial, category: MaterialCategory) {
    updateFields('lesson_materials', m.id, { category, position: count(category) })
  }

  function addLink() {
    const u = normalizeUrl(url)
    if (!u) {
      setError('Це не схоже на посилання. Приклад: wayground.com/join')
      return
    }
    const name = title.trim() || linkTitle(u)
    add(
      { title: name, kind: 'link', drive_file_id: null, url: u, mime_type: null, size_bytes: null },
      guessCategory(`${name} ${u}`),
    )
    setUrl('')
    setTitle('')
    setLinkOpen(false)
    setError('')
  }

  async function upload(files: FileList | File[] | null) {
    if (!files?.length) return
    if (!canDrive) {
      setError(driveProblem)
      return
    }
    setError('')
    const list = [...files].map((f) => ({ file: f, key: ++uploadKey, category: guessCategory(f.name) }))
    for (const x of list) chosen.current.set(x.key, x.category)
    setUploads((u) => [...u, ...list.map(({ file, key, category }) => ({ key, name: file.name, progress: 0, category }))])
    const folder = driveFolder(year, course, { lesson })
    for (const [i, { file, key }] of list.entries()) {
      const set = (patch: Partial<UploadItem>) =>
        setUploads((u) => u.map((x) => (x.key === key ? { ...x, ...patch } : x)))
      try {
        const d = await uploadFile(file, folder, (progress) => set({ progress }))
        addDriveFile(d, chosen.current.get(key) ?? null, i)
        chosen.current.delete(key)
        setUploads((u) => u.filter((x) => x.key !== key))
      } catch (e) {
        console.error(e)
        set({ error: e instanceof DriveError ? e.message : 'Не вдалося завантажити файл.' })
      }
    }
  }

  function chooseForUpload(key: number, category: MaterialCategory) {
    chosen.current.set(key, category)
    setUploads((u) => u.map((x) => (x.key === key ? { ...x, category } : x)))
  }

  async function pick() {
    setError('')
    if (!canDrive) {
      setError(driveProblem)
      return
    }
    try {
      const files = await pickFiles()
      files.forEach((f, i) => addDriveFile(f, guessCategory(f.name), i))
    } catch (e) {
      console.error(e)
      setError(e instanceof DriveError ? e.message : 'Не вдалося відкрити Google Диск.')
    }
  }

  async function remove(m: LessonMaterial) {
    const note = m.kind === 'file' ? ' Сам файл залишиться на Google Диску.' : ''
    if (await ask(`Прибрати «${m.title}»?${note}`, { ok: 'Прибрати' })) removeDoc('lesson_materials', m.id)
  }

  // ---------- Файли з пристрою, кинуті в поле ----------

  const hasFiles = (e: DragEvent) => e.dataTransfer.types.includes('Files')

  function dragOver(e: DragEvent) {
    if (!hasFiles(e)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    if (!over) setOver(true)
  }

  function dragLeave(e: DragEvent) {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
    setOver(false)
  }

  function drop(e: DragEvent) {
    if (!hasFiles(e)) return
    e.preventDefault()
    setOver(false)
    upload([...e.dataTransfer.files])
  }

  const freshCount = uploads.length + unsorted.length

  return (
    <Dialog title="Матеріали" subtitle={heading} onClose={onClose} className="materials-dialog">
      <div className={over ? 'dropzone over' : 'dropzone'} onDragOver={dragOver} onDragLeave={dragLeave} onDrop={drop}>
        <span className="dz-icon">
          <Upload size={20} />
        </span>
        <p className="dz-title">Перетягни файли сюди</p>
        <p className="dz-sub">Тип визначиться за назвою файлу, а якщо ні — обереш його сам</p>
        <div className="dz-actions">
          <button
            type="button"
            className="btn ghost small"
            onClick={() => (canDrive ? fileInput.current?.click() : setError(driveProblem))}
          >
            <FolderOpen size={14} /> З пристрою
          </button>
          <button type="button" className="btn ghost small" onClick={pick}>
            <Cloud size={14} /> З Google Диска
          </button>
          <button
            type="button"
            className={linkOpen ? 'btn ghost small on' : 'btn ghost small'}
            aria-expanded={linkOpen}
            onClick={() => {
              setLinkOpen(!linkOpen)
              setError('')
            }}
          >
            <Link2 size={14} /> Посилання
          </button>
        </div>
        {linkOpen && (
          <form
            className="link-form"
            onSubmit={(e) => {
              e.preventDefault()
              addLink()
            }}
          >
            <input
              className="field"
              autoFocus
              placeholder="Посилання"
              aria-label="Посилання"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <input
              className="field"
              placeholder="Назва (необов'язково)"
              aria-label="Назва посилання"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <button className="btn" type="submit" disabled={!url.trim()}>
              <Plus size={16} /> Додати
            </button>
          </form>
        )}
      </div>
      <input
        ref={fileInput}
        type="file"
        multiple
        hidden
        onChange={(e) => (upload(e.target.files), (e.target.value = ''))}
      />

      {freshCount > 0 && (
        <>
          <div className="list-label">
            Щойно додані <span className="cnt">{freshCount}</span>
          </div>
          <div className="mlist">
            {uploads.map((u) => (
              <div key={u.key} className="mrow new">
                <KindPicker value={u.category} onChange={(c) => chooseForUpload(u.key, c)} />
                <div className="mname">
                  <span className="mtitle">{u.name}</span>
                  {u.error ? (
                    <small className="field-error">{u.error}</small>
                  ) : (
                    <span className="bar" aria-label={`Завантаження ${Math.round(u.progress * 100)}%`}>
                      <i style={{ width: `${Math.round(u.progress * 100)}%` }} />
                    </span>
                  )}
                </div>
                <small className="msize num">{u.error ? '' : `${Math.round(u.progress * 100)}%`}</small>
                {u.error ? (
                  <button
                    className="icon-btn"
                    onClick={() => setUploads((x) => x.filter((y) => y !== u))}
                    aria-label="Сховати"
                  >
                    <X size={15} />
                  </button>
                ) : (
                  <span />
                )}
              </div>
            ))}
            {unsorted.map((m) => (
              <MaterialRow key={m.id} m={m} onKind={(c) => setKind(m, c)} onRemove={() => remove(m)} />
            ))}
          </div>
        </>
      )}

      {sorted.length > 0 && (
        <>
          <div className="list-label">
            Матеріали уроку <span className="cnt">{sorted.length}</span>
          </div>
          <div className="mlist">
            {sorted.map((m) => (
              <MaterialRow key={m.id} m={m} onKind={(c) => setKind(m, c)} onRemove={() => remove(m)} />
            ))}
          </div>
        </>
      )}

      {!canDrive && <p className="muted small-text">{driveProblem}</p>}
      {error && <p className="field-error">{error}</p>}
    </Dialog>
  )
}
