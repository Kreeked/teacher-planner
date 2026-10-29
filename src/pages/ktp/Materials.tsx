import { ask } from '../../lib/confirm'
import {
  DndContext,
  closestCenter,
  pointerWithin,
  useDroppable,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import {
  ClipboardList,
  Cloud,
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
  Pin,
  Plus,
  Presentation,
  Shield,
  Smartphone,
  Trash2,
  Upload,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react'
import { Dialog } from '../../components/Dialog'
import { Menu } from '../../components/Menu'
import { DragHandle } from '../../components/Sortable'
import { useDragSensors, useSortableItem } from '../../lib/drag'
import { BatchWriter, createDoc, removeDoc, updateFields } from '../../data/db'
import {
  CATEGORIES,
  driveFolder,
  filledShelves,
  formatSize,
  groupByCategory,
  linkTitle,
  materialType,
  materialUrl,
  materialsOf,
  normalizeUrl,
  placeMaterial,
  shelfPatches,
  SHELVES,
  type MaterialType,
  type Shelf,
  type Shelves,
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

type UploadItem = { key: number; shelf: Shelf; name: string; progress: number; error?: string }

const shelfId = (s: Shelf) => `shelf:${s}`

// Спершу — рядок або розділ під пальцем/мишею (рядки важливіші), інакше найближчий.
const collide: CollisionDetection = (args) => {
  const hits = pointerWithin(args)
  const rows = hits.filter((h) => !String(h.id).startsWith('shelf:'))
  if (rows.length) return rows
  if (hits.length) return hits
  return closestCenter(args)
}

let uploadKey = 0

/**
 * Матеріали уроку — п'ять розділів за типами (+ тимчасовий «Без типу»),
 * матеріали теми — один список. Файли з пристрою на Диск, файли з Диска, посилання.
 */
export function MaterialsDialog({ course, year, lesson, topic, materials, onClose }: DialogProps) {
  const [uploads, setUploads] = useState<UploadItem[]>([])
  const [error, setError] = useState('')
  const [linkFor, setLinkFor] = useState<Shelf | null>(null)
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [online, setOnline] = useState(() => navigator.onLine)
  const [preview, setPreview] = useState<Shelves | null>(null)
  const [dropOn, setDropOn] = useState<Shelf | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const fileShelf = useRef<Shelf>('none')
  const sensors = useDragSensors()

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
  // Матеріали теми — один список у розділі «none» (без типів).
  const saved: Shelves = lesson ? groupByCategory(own) : { ...groupByCategory([]), none: own }
  const groups = preview ?? saved
  const heading = lesson
    ? `${lesson.extra ? 'Урок *' : `Урок ${lesson.number}`}${lesson.title ? ` «${lesson.title}»` : ''}`
    : `Тема «${topic!.title}»`
  const target = { lesson_id: lesson?.id ?? null, topic_id: lesson ? null : topic!.id }
  const canDrive = driveConfigured && online
  const driveProblem = !driveConfigured
    ? 'Підключення до Google Диска ще налаштовується, поки можна додавати посилання.'
    : 'Без інтернету файли не завантажуються, посилання додати можна.'

  const sections: { key: Shelf; title: string }[] = lesson
    ? [
        ...CATEGORIES.map((c) => ({ key: c.value as Shelf, title: c.label })),
        ...(groups.none.length ? [{ key: 'none' as Shelf, title: 'Без типу' }] : []),
      ]
    : [{ key: 'none', title: 'Спільні файли теми' }]

  function add(
    data: Pick<LessonMaterial, 'title' | 'kind' | 'drive_file_id' | 'url' | 'mime_type' | 'size_bytes'>,
    shelf: Shelf,
    i = 0,
  ) {
    createDoc('lesson_materials', {
      course_id: course.id,
      ...target,
      ...data,
      position: groups[shelf].length + i,
      keep_offline: false,
      category: lesson && shelf !== 'none' ? shelf : null,
    })
  }

  function addDriveFile(f: DriveFile, shelf: Shelf, i = 0) {
    add(
      { title: f.name, kind: 'file', drive_file_id: f.id, url: null, mime_type: f.mimeType, size_bytes: f.size },
      shelf,
      i,
    )
  }

  function addLink(shelf: Shelf) {
    const u = normalizeUrl(url)
    if (!u) {
      setError('Це не схоже на посилання. Приклад: wayground.com/join')
      return
    }
    add(
      {
        title: title.trim() || linkTitle(u),
        kind: 'link',
        drive_file_id: null,
        url: u,
        mime_type: null,
        size_bytes: null,
      },
      shelf,
    )
    setUrl('')
    setTitle('')
    setLinkFor(null)
    setError('')
  }

  async function upload(files: FileList | File[] | null, shelf: Shelf) {
    if (!files?.length) return
    if (!canDrive) {
      setError(driveProblem)
      return
    }
    setError('')
    const list = [...files].map((f) => ({ file: f, key: ++uploadKey }))
    setUploads((u) => [...u, ...list.map(({ file, key }) => ({ key, shelf, name: file.name, progress: 0 }))])
    const folder = driveFolder(year, course, { lesson, topic })
    for (const [i, { file, key }] of list.entries()) {
      const set = (patch: Partial<UploadItem>) =>
        setUploads((u) => u.map((x) => (x.key === key ? { ...x, ...patch } : x)))
      try {
        const d = await uploadFile(file, folder, (progress) => set({ progress }))
        addDriveFile(d, shelf, i)
        setUploads((u) => u.filter((x) => x.key !== key))
      } catch (e) {
        console.error(e)
        set({ error: e instanceof DriveError ? e.message : 'Не вдалося завантажити файл.' })
      }
    }
  }

  async function pick(shelf: Shelf) {
    setError('')
    if (!canDrive) {
      setError(driveProblem)
      return
    }
    try {
      const files = await pickFiles()
      files.forEach((f, i) => addDriveFile(f, shelf, i))
    } catch (e) {
      console.error(e)
      setError(e instanceof DriveError ? e.message : 'Не вдалося відкрити Google Диск.')
    }
  }

  async function remove(m: LessonMaterial) {
    const note = m.kind === 'file' ? ' Сам файл залишиться на Google Диску.' : ''
    if (await ask(`Прибрати «${m.title}»?${note}`, { ok: 'Прибрати' })) removeDoc('lesson_materials', m.id)
  }

  // ---------- Перетягування між розділами ----------

  const shelfWith = (g: Shelves, id: string) =>
    id.startsWith('shelf:') ? (id.slice(6) as Shelf) : SHELVES.find((s) => g[s].some((m) => m.id === id))

  // Рядок перейшов в інший розділ — переносимо одразу, щоб там розсунулося місце.
  function dragOver({ active, over }: DragOverEvent) {
    if (!preview || !over) return
    const id = String(active.id)
    const from = shelfWith(preview, id)
    const to = shelfWith(preview, String(over.id))
    if (!from || !to || from === to) return
    const index = String(over.id).startsWith('shelf:')
      ? preview[to].length
      : preview[to].findIndex((m) => m.id === over.id)
    setPreview(placeMaterial(preview, id, to, index))
  }

  function dragEnd({ active, over }: DragEndEvent) {
    const current = preview
    setPreview(null)
    if (!current || !over) return
    const id = String(active.id)
    const to = shelfWith(current, String(over.id))
    if (!to) return
    const index = String(over.id).startsWith('shelf:')
      ? current[to].filter((m) => m.id !== id).length
      : current[to].findIndex((m) => m.id === over.id)
    const next = placeMaterial(current, id, to, index)
    const writer = new BatchWriter()
    if (lesson)
      for (const { id: mid, ...patch } of shelfPatches(next)) updateFields('lesson_materials', mid, patch, writer.batch)
    else
      next.none.forEach(
        (m, i) => m.position !== i && updateFields('lesson_materials', m.id, { position: i }, writer.batch),
      )
    writer.commit()
  }

  // ---------- Файли з пристрою, кинуті на розділ ----------

  const hasFiles = (e: DragEvent) => e.dataTransfer.types.includes('Files')

  function fileDragOver(e: DragEvent, shelf: Shelf) {
    if (!hasFiles(e)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    if (dropOn !== shelf) setDropOn(shelf)
  }

  function fileDragLeave(e: DragEvent, shelf: Shelf) {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
    if (dropOn === shelf) setDropOn(null)
  }

  function fileDrop(e: DragEvent, shelf: Shelf) {
    if (!hasFiles(e)) return
    e.preventDefault()
    setDropOn(null)
    upload([...e.dataTransfer.files], shelf)
  }

  return (
    <Dialog title="Матеріали" subtitle={heading} onClose={onClose} className="materials-dialog">
      <DndContext
        sensors={sensors}
        collisionDetection={collide}
        onDragStart={() => setPreview(saved)}
        onDragOver={dragOver}
        onDragEnd={dragEnd}
        onDragCancel={() => setPreview(null)}
      >
        {sections.map(({ key, title: name }) => (
          <Section
            key={key}
            shelf={key}
            title={name}
            icon={lesson ? SHELF_ICONS[key] : FolderOpen}
            items={groups[key]}
            dropping={dropOn === key}
            muted={!!lesson && key === 'none'}
            onDragOver={(e) => fileDragOver(e, key)}
            onDragLeave={(e) => fileDragLeave(e, key)}
            onDrop={(e) => fileDrop(e, key)}
            onDevice={() => {
              if (!canDrive) return setError(driveProblem)
              fileShelf.current = key
              fileInput.current?.click()
            }}
            onDrive={() => pick(key)}
            onLink={() => {
              setLinkFor(linkFor === key ? null : key)
              setError('')
            }}
            onRemove={remove}
          >
            {uploads
              .filter((u) => u.shelf === key)
              .map((u) => (
                <div key={u.key} className="material-row uploading">
                  <Upload size={14} />
                  <span className="grow">{u.name}</span>
                  {u.error ? (
                    <span className="field-error">{u.error}</span>
                  ) : (
                    <small>{Math.round(u.progress * 100)}%</small>
                  )}
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
            {!groups[key].length && !uploads.some((u) => u.shelf === key) && (
              <p className="m-drop">Перетягни файл сюди або натисни «Додати»</p>
            )}
            {linkFor === key && (
              <form
                className="link-form"
                onSubmit={(e) => {
                  e.preventDefault()
                  addLink(key)
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
                  <Plus size={15} /> Додати
                </button>
              </form>
            )}
          </Section>
        ))}
      </DndContext>
      <input
        ref={fileInput}
        type="file"
        multiple
        hidden
        onChange={(e) => (upload(e.target.files, fileShelf.current), (e.target.value = ''))}
      />

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

      {!canDrive && <p className="muted small-text">{driveProblem}</p>}
      {error && <p className="field-error">{error}</p>}
    </Dialog>
  )
}

type SectionProps = {
  shelf: Shelf
  title: string
  icon: LucideIcon
  items: LessonMaterial[]
  dropping: boolean
  muted: boolean // тимчасовий розділ «Без типу»
  onDragOver: (e: DragEvent) => void
  onDragLeave: (e: DragEvent) => void
  onDrop: (e: DragEvent) => void
  onDevice: () => void
  onDrive: () => void
  onLink: () => void
  onRemove: (m: LessonMaterial) => void
  children: ReactNode
}

/** Розділ вікна матеріалів: заголовок із «Додати», рядки, що перетягуються, зона для файлів. */
function Section(props: SectionProps) {
  const { shelf, title, icon: Icon, items, dropping, muted, onRemove, children } = props
  const { setNodeRef, isOver } = useDroppable({ id: shelfId(shelf) })
  const cls = ['m-sec', (dropping || (isOver && !items.length)) && 'drop', muted && 'other']
  return (
    <section
      ref={setNodeRef}
      className={cls.filter(Boolean).join(' ')}
      onDragOver={props.onDragOver}
      onDragLeave={props.onDragLeave}
      onDrop={props.onDrop}
      aria-label={title}
    >
      <div className="m-sec-head">
        <Icon size={16} aria-hidden />
        <b>{title}</b>
        <span className="cnt">{items.length}</span>
        <span className="grow" />
        <Menu
          label={`Додати: ${title}`}
          trigger={
            <>
              <Plus size={15} /> Додати
            </>
          }
          triggerClass="btn ghost small"
          groups={[
            [
              { label: 'З пристрою', icon: Upload, onSelect: props.onDevice },
              { label: 'З Google Диска', icon: Cloud, onSelect: props.onDrive },
              { label: 'Посилання', icon: Link2, onSelect: props.onLink },
            ],
          ]}
        />
      </div>
      <SortableContext items={items.map((m) => m.id)} strategy={verticalListSortingStrategy}>
        {items.length > 0 && (
          <div className="material-list">
            {items.map((m) => (
              <MaterialRow key={m.id} m={m} onRemove={() => onRemove(m)} />
            ))}
          </div>
        )}
      </SortableContext>
      {children}
    </section>
  )
}
