import { ask } from '../../lib/confirm'
import {
  Cloud,
  File,
  FileSpreadsheet,
  FileText,
  Film,
  Image,
  Link2,
  Pin,
  Presentation,
  Smartphone,
  Trash2,
  Upload,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Dialog } from '../../components/Dialog'
import { DragHandle, SortableList } from '../../components/Sortable'
import { useSortableItem } from '../../lib/drag'
import { commit, createDoc, newBatch, removeDoc, updateFields } from '../../data/db'
import {
  driveFolder,
  formatSize,
  linkTitle,
  materialType,
  materialUrl,
  materialsOf,
  normalizeUrl,
  type MaterialType,
} from '../../data/materials'
import type { AcademicYear, Course, Lesson, LessonMaterial, Topic } from '../../data/types'
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

/** Рядок матеріалу в діалозі: ручка для перетягування, шпилька, видалення. */
function MaterialRow({ m, onRemove }: { m: LessonMaterial; onRemove: () => void }) {
  const { ref, style, handle } = useSortableItem(m.id)
  return (
    <div ref={ref} style={style} className="material-row">
      <DragHandle label={`Перемістити ${m.title}`} {...handle} />
      <MaterialLink m={m} />
      {m.kind === 'file' && (
        <button
          className={m.keep_offline ? 'icon-btn pin on' : 'icon-btn pin'}
          aria-pressed={m.keep_offline}
          onClick={() => updateFields('lesson_materials', m.id, { keep_offline: !m.keep_offline })}
          aria-label="Завжди мати на пристрої"
          title={
            m.keep_offline
              ? 'Завжди на пристрої. Натисни, щоб тримати лише перед уроком'
              : 'Завжди мати на пристрої, не лише в тиждень уроку'
          }
        >
          <Pin size={14} />
        </button>
      )}
      <button className="icon-btn del" onClick={onRemove} aria-label={`Прибрати ${m.title}`}>
        <Trash2 size={15} />
      </button>
    </div>
  )
}

type DialogProps = {
  course: Course
  year?: AcademicYear
  lesson?: Lesson
  topic?: Topic
  materials: LessonMaterial[] // усі матеріали курсу
  onClose: () => void
}

type Upload = { name: string; progress: number; error?: string }

/** Матеріали уроку або теми: файли з пристрою на Диск, файли з Диска, посилання. */
export function MaterialsDialog({ course, year, lesson, topic, materials, onClose }: DialogProps) {
  const [uploads, setUploads] = useState<Upload[]>([])
  const [error, setError] = useState('')
  const [linkOpen, setLinkOpen] = useState(false)
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [online, setOnline] = useState(() => navigator.onLine)
  const fileInput = useRef<HTMLInputElement>(null)

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

  const { own, topic: shared } = lesson
    ? materialsOf(materials, lesson)
    : {
        own: materials.filter((m) => m.topic_id === topic!.id && !m.lesson_id).sort((a, b) => a.position - b.position),
        topic: [],
      }
  const heading = lesson
    ? `${lesson.extra ? 'Урок *' : `Урок ${lesson.number}`}${lesson.title ? ` «${lesson.title}»` : ''}`
    : `Тема «${topic!.title}»`
  const target = { lesson_id: lesson?.id ?? null, topic_id: lesson ? null : topic!.id }
  const canDrive = driveConfigured && online

  function add(
    data: Omit<
      LessonMaterial,
      'id' | 'owner_id' | 'course_id' | 'lesson_id' | 'topic_id' | 'position' | 'keep_offline'
    >,
    i = 0,
  ) {
    createDoc('lesson_materials', {
      course_id: course.id,
      ...target,
      ...data,
      position: own.length + i,
      keep_offline: false,
    })
  }

  function addDriveFile(f: DriveFile, i = 0) {
    add({ title: f.name, kind: 'file', drive_file_id: f.id, url: null, mime_type: f.mimeType, size_bytes: f.size }, i)
  }

  function addLink() {
    const u = normalizeUrl(url)
    if (!u) {
      setError('Це не схоже на посилання. Приклад: wayground.com/join')
      return
    }
    add({
      title: title.trim() || linkTitle(u),
      kind: 'link',
      drive_file_id: null,
      url: u,
      mime_type: null,
      size_bytes: null,
    })
    setUrl('')
    setTitle('')
    setLinkOpen(false)
    setError('')
  }

  async function upload(files: FileList | null) {
    if (!files?.length) return
    setError('')
    const list = [...files]
    setUploads((u) => [...u, ...list.map((f) => ({ name: f.name, progress: 0 }))])
    const folder = driveFolder(year, course, { lesson, topic })
    for (const [i, f] of list.entries()) {
      const set = (patch: Partial<Upload>) =>
        setUploads((u) => u.map((x) => (x.name === f.name ? { ...x, ...patch } : x)))
      try {
        const d = await uploadFile(f, folder, (progress) => set({ progress }))
        addDriveFile(d, i)
        setUploads((u) => u.filter((x) => x.name !== f.name))
      } catch (e) {
        console.error(e)
        set({ error: e instanceof DriveError ? e.message : 'Не вдалося завантажити файл.' })
      }
    }
  }

  async function pick() {
    setError('')
    try {
      const files = await pickFiles()
      files.forEach(addDriveFile)
    } catch (e) {
      console.error(e)
      setError(e instanceof DriveError ? e.message : 'Не вдалося відкрити Google Диск.')
    }
  }

  function reorder(next: LessonMaterial[]) {
    const batch = newBatch()
    next.forEach((m, i) => m.position !== i && updateFields('lesson_materials', m.id, { position: i }, batch))
    commit(batch)
  }

  async function remove(m: LessonMaterial) {
    const note = m.kind === 'file' ? ' Сам файл залишиться на Google Диску.' : ''
    if (await ask(`Прибрати «${m.title}»?${note}`, { ok: 'Прибрати' })) removeDoc('lesson_materials', m.id)
  }

  return (
    <Dialog title="Матеріали" subtitle={heading} onClose={onClose} className="materials-dialog">
      <div className="material-list">
        {!own.length && !uploads.length && <p className="muted small-text">Ще нічого не додано.</p>}
        <SortableList items={own} getId={(m) => m.id} onReorder={reorder}>
          {(m) => <MaterialRow key={m.id} m={m} onRemove={() => remove(m)} />}
        </SortableList>
        {uploads.map((u) => (
          <div key={u.name} className="material-row uploading">
            <Upload size={14} />
            <span className="grow">{u.name}</span>
            {u.error ? <span className="field-error">{u.error}</span> : <small>{Math.round(u.progress * 100)}%</small>}
            {u.error && (
              <button
                className="icon-btn"
                onClick={() => setUploads((x) => x.filter((y) => y !== u))}
                aria-label="Сховати"
              >
                <X size={14} />
              </button>
            )}
          </div>
        ))}
      </div>

      {shared.length > 0 && (
        <>
          <span className="form-label">Спільні для всієї теми</span>
          <div className="material-list">
            {shared.map((m) => (
              <MaterialLink key={m.id} m={m} />
            ))}
          </div>
        </>
      )}

      <div className="row-actions">
        <button className="btn ghost" disabled={!canDrive} onClick={() => fileInput.current?.click()}>
          <Upload size={15} /> Файл з пристрою
        </button>
        <button className="btn ghost" disabled={!canDrive} onClick={pick}>
          <Cloud size={15} /> З Google Диска
        </button>
        <button className="btn ghost" onClick={() => setLinkOpen(!linkOpen)} aria-expanded={linkOpen}>
          <Link2 size={15} /> Посилання
        </button>
        <input
          ref={fileInput}
          type="file"
          multiple
          hidden
          onChange={(e) => (upload(e.target.files), (e.target.value = ''))}
        />
      </div>
      {!driveConfigured && (
        <p className="muted small-text">
          Підключення до Google Диска ще налаштовується, поки можна додавати посилання.
        </p>
      )}
      {driveConfigured && !online && (
        <p className="muted small-text">Без інтернету файли не завантажуються, посилання додати можна.</p>
      )}

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
            Додати
          </button>
        </form>
      )}
      {error && <p className="field-error">{error}</p>}
    </Dialog>
  )
}
