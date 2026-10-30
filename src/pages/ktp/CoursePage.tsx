import { ask } from '../../lib/confirm'
import { reveal } from '../../lib/reveal'
import {
  DndContext,
  DragOverlay,
  closestCenter,
  useDroppable,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import {
  Check,
  ChevronDown,
  GripVertical,
  Pencil,
  Plus,
  Settings2,
  Trash2,
  TriangleAlert,
} from 'lucide-react'
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { DatePicker } from '../../components/DatePicker'
import { toISO } from '../../data/schedule'
import { InlineText } from '../../components/InlineText'
import { Menu, type MenuItem } from '../../components/Menu'
import { useDragSensors, useSortableItem, type HandleProps } from '../../lib/drag'
import {
  commit,
  createDoc,
  deleteRefs,
  newBatch,
  putDoc,
  ref,
  refsWhere,
  removeDoc,
  updateFields,
  useCollection,
} from '../../data/db'
import {
  LESSON_TYPES,
  countedLessons,
  courseTitle,
  groupLessons,
  hourWarnings,
  lessonsWord,
  placeLesson,
  placeTopic,
  renumber,
  typePatch,
  weeklyHours,
  type TopicBlock,
  type Warning,
} from '../../data/ktp'
import { materialsOf } from '../../data/materials'
import type {
  AcademicYear,
  ClassGroup,
  Lesson,
  LessonMaterial,
  LessonSchedule,
  LessonType,
  Topic,
} from '../../data/types'
import { gradeColor, shortDate } from '../../data/year'
import { CourseSettings } from './CourseSettings'
import { LessonShelves, MaterialsDialog } from './Materials'
import { useClassifyLegacy } from '../../lib/useClassifyLegacy'
import type { WriteBatch } from 'firebase/firestore'

/** Записує новий порядок: позиції тем і номери/позиції уроків, що змінилися. */
function applyOrder(blocks: TopicBlock[], batch: WriteBatch, skip?: string) {
  blocks.forEach(({ topic }, i) => {
    if (topic.position !== i && topic.id !== skip) updateFields('topics', topic.id, { position: i }, batch)
  })
  for (const { id, ...patch } of renumber(blocks)) if (id !== skip) updateFields('lessons', id, patch, batch)
}

const typeLabel = (t: LessonType) => LESSON_TYPES.find((x) => x.value === t)?.label ?? ''
// Кружечок типу в меню вибору — той самий колір, що й мітка типу в перегляді.
const TYPE_SWATCH: Record<LessonType, string> = {
  regular: 'var(--bg)',
  practical: 'var(--peri)',
  test: 'var(--peach)',
  reserve: 'var(--surface)',
}
const lessonNo = (l: Lesson) => (l.extra ? '*' : String(l.number))

// Ідентифікатори для перетягування: тема, урок і «кінець теми» (місце під останнім уроком).
const topicKey = (id: string) => `t:${id}`
const lessonKey = (id: string) => `l:${id}`
const endKey = (id: string) => `z:${id}`

export function CoursePage() {
  const { courseId = '' } = useParams()
  const navigate = useNavigate()
  const byCourse = { field: 'course_id', value: courseId }
  const { items: courses, loading } = useCollection('courses')
  const { items: topics } = useCollection('topics', byCourse)
  const { items: lessons } = useCollection('lessons', byCourse)
  const { items: links } = useCollection('course_classes', byCourse)
  const { items: schedules } = useCollection('lesson_schedules', byCourse)
  const { items: years } = useCollection('academic_years')
  const course = courses.find((c) => c.id === courseId)
  const { items: yearClasses } = useCollection(
    'class_groups',
    course ? { field: 'academic_year_id', value: course.academic_year_id } : null,
  )
  const { items: materials } = useCollection('lesson_materials', byCourse)
  // Старі файли уроків без типу розкладаємо по поличках (один раз).
  useClassifyLegacy(materials)
  // Перехід з головної: прокрутити до потрібного уроку (один раз, коли він з'явиться на сторінці).
  const [params] = useSearchParams()
  const focusId = params.get('lesson')
  const { key: visit } = useLocation()
  const focused = useRef<string | null>(null)
  useLayoutEffect(() => {
    if (!focusId || focused.current === visit) return
    const el = document.getElementById(`lesson-${focusId}`)
    if (!el) return
    focused.current = visit
    reveal(el)
  }, [focusId, visit, lessons.length, loading])
  // Нова тема: прокрутити до неї й підсвітити, щойно вона з'явиться на сторінці.
  const newTopic = useRef<string | null>(null)
  useLayoutEffect(() => {
    if (!newTopic.current) return
    const el = document.getElementById(`topic-${newTopic.current}`)
    if (!el) return
    newTopic.current = null
    reveal(el)
  }, [topics.length])
  const [showSettings, setShowSettings] = useState(false)
  const [editing, setEditing] = useState(false)
  const [materialsFor, setMaterialsFor] = useState<string | null>(null)
  // Щойно доданий урок отримує фокус на полі теми.
  const [newLessonId, setNewLessonId] = useState<string | null>(null)
  // Порядок під час перетягування: урок може тимчасово перейти в іншу тему, доки його не відпустили.
  const [drag, setDrag] = useState<{ id: string; blocks: TopicBlock[] } | null>(null)
  const sensors = useDragSensors()
  // Дати, що вже минули, показуємо блідіше.
  const [today] = useState(() => toISO(new Date()))

  if (loading) return null
  if (!course)
    return (
      <div className="page">
        <main className="main">
          <h1>КТП не знайдено</h1>
        </main>
      </div>
    )

  const saved = groupLessons(topics, lessons)
  const blocks = drag?.blocks ?? saved
  const warnings = hourWarnings(saved)
  const color = gradeColor(course.grade)
  const year = years.find((y) => y.id === course.academic_year_id)
  // Колонки дат — класи курсу в порядку прив'язки.
  const classes = [...links]
    .sort((a, b) => a.position - b.position)
    .map((l) => yearClasses.find((c) => c.id === l.class_group_id))
    .filter((c): c is ClassGroup => !!c)
  const scheduleById = new Map(schedules.map((s) => [s.id, s]))
  function addTopic() {
    const id = createDoc('topics', {
      course_id: courseId,
      position: saved.length,
      title: `Тема ${saved.length + 1}`,
      planned_hours: 0,
    })
    newTopic.current = id
  }

  function addLesson(topic: Topic) {
    const batch = newBatch()
    const block = saved.find((b) => b.topic.id === topic.id)!
    const draft: Omit<Lesson, 'id' | 'owner_id'> = {
      course_id: courseId,
      topic_id: topic.id,
      period_id: null,
      position: block.lessons.length,
      number: 0,
      title: '',
      lesson_type: 'regular',
      homework: '',
      notes: '',
    }
    const id = createDoc('lessons', draft, batch)
    const next = saved.map((b) =>
      b.topic.id === topic.id ? { ...b, lessons: [...b.lessons, { ...draft, id, owner_id: '' }] } : b,
    )
    // Номер нового уроку записуємо одразу, решту — зсуваємо.
    const own = renumber(next).find((p) => p.id === id)
    if (own) updateFields('lessons', id, { number: own.number }, batch)
    applyOrder(next, batch, id)
    commit(batch)
    setNewLessonId(id)
  }

  /** Зміна типу; «Резерв» знімає номер з уроку, тож решту уроків перенумеровуємо. */
  function setType(l: Lesson, type: LessonType) {
    const patch = typePatch(l, type)
    const batch = newBatch()
    updateFields('lessons', l.id, patch, batch)
    if ('extra' in patch)
      applyOrder(
        saved.map((b) => ({ ...b, lessons: b.lessons.map((x) => (x.id === l.id ? { ...x, ...patch } : x)) })),
        batch,
      )
    commit(batch)
  }

  async function removeLesson(l: Lesson) {
    if (l.title && !(await ask(`Видалити урок ${lessonNo(l)} «${l.title}»?`))) return
    const batch = newBatch()
    batch.delete(ref('lessons', l.id))
    applyOrder(
      saved.map((b) => ({ ...b, lessons: b.lessons.filter((x) => x.id !== l.id) })),
      batch,
    )
    commit(batch)
    deleteRefs([
      ...(await refsWhere('lesson_schedules', 'lesson_id', l.id)),
      ...(await refsWhere('lesson_materials', 'lesson_id', l.id)),
    ])
  }

  async function removeTopic(b: TopicBlock) {
    const msg = b.lessons.length
      ? `Видалити тему «${b.topic.title}» разом із ${b.lessons.length} ${lessonsWord(b.lessons.length)}?`
      : `Видалити тему «${b.topic.title}»?`
    if (!(await ask(msg))) return
    const batch = newBatch()
    batch.delete(ref('topics', b.topic.id))
    for (const l of b.lessons) batch.delete(ref('lessons', l.id))
    applyOrder(
      saved.filter((x) => x.topic.id !== b.topic.id),
      batch,
    )
    commit(batch)
    deleteRefs(await refsWhere('lesson_materials', 'topic_id', b.topic.id))
    for (const l of b.lessons)
      deleteRefs([
        ...(await refsWhere('lesson_schedules', 'lesson_id', l.id)),
        ...(await refsWhere('lesson_materials', 'lesson_id', l.id)),
      ])
  }

  // ---------- Перетягування тем і уроків ----------

  // Тема «бачить» лише теми, урок — уроки та кінці тем (щоб покласти в порожню тему або в кінець).
  const collide: CollisionDetection = (args) => {
    const kind = String(args.active.id)[0]
    return closestCenter({
      ...args,
      droppableContainers: args.droppableContainers.filter((c) =>
        kind === 't' ? String(c.id)[0] === 't' : String(c.id)[0] !== 't',
      ),
    })
  }

  /** Куди ляже урок, якщо відпустити його над over: тема та місце в ній. */
  function target(list: TopicBlock[], over: string, lessonId: string) {
    const id = over.slice(2)
    if (over[0] === 'z') {
      const b = list.find((x) => x.topic.id === id)
      return b && { topicId: id, index: b.lessons.filter((l) => l.id !== lessonId).length }
    }
    const b = list.find((x) => x.lessons.some((l) => l.id === id))
    return b && { topicId: b.topic.id, index: b.lessons.findIndex((l) => l.id === id) }
  }

  function dragStart({ active }: DragStartEvent) {
    setDrag({ id: String(active.id), blocks: saved })
  }

  // Урок перейшов в іншу тему — переносимо одразу, щоб рядки розсунулися вже там.
  function dragOver({ active, over }: DragOverEvent) {
    if (!drag || !over || drag.id[0] !== 'l') return
    const lessonId = drag.id.slice(2)
    const to = target(drag.blocks, String(over.id), lessonId)
    const from = drag.blocks.find((b) => b.lessons.some((l) => l.id === lessonId))
    if (!to || !from || from.topic.id === to.topicId) return
    // Над нижньою половиною рядка — ставимо після нього.
    const below =
      over.id !== endKey(to.topicId) &&
      active.rect.current.translated &&
      active.rect.current.translated.top > over.rect.top + over.rect.height / 2
    setDrag({ ...drag, blocks: placeLesson(drag.blocks, lessonId, to.topicId, to.index + (below ? 1 : 0)) })
  }

  function dragEnd({ over }: DragEndEvent) {
    const current = drag
    setDrag(null)
    if (!current || !over) return
    const id = current.id.slice(2)
    let next: TopicBlock[] | undefined
    if (current.id[0] === 't') {
      const to = current.blocks.findIndex((b) => topicKey(b.topic.id) === over.id)
      if (to >= 0) next = placeTopic(current.blocks, id, to)
    } else {
      const to = target(current.blocks, String(over.id), id)
      if (to) next = placeLesson(current.blocks, id, to.topicId, to.index)
    }
    if (!next) return
    const batch = newBatch()
    applyOrder(next, batch)
    commit(batch)
  }

  const dragged =
    drag &&
    (drag.id[0] === 't'
      ? blocks.find((b) => topicKey(b.topic.id) === drag.id)?.topic
      : blocks.flatMap((b) => b.lessons).find((l) => lessonKey(l.id) === drag.id))

  return (
    <div className="page">
      <main className="main">
        <div className="sec-head page-head">
          <h1>{courseTitle(course)}</h1>
          <span className="grow" />
          <div className="actions">
            {editing && (
              <button className="btn ghost" onClick={addTopic}>
                <Plus size={15} /> Нова тема
              </button>
            )}
            <button className="btn ghost" onClick={() => setShowSettings(true)} aria-haspopup="dialog">
              <Settings2 size={15} /> Параметри
            </button>
            <button className={editing ? 'btn' : 'btn ghost'} onClick={() => setEditing(!editing)}>
              {editing ? (
                <>
                  <Check size={15} /> Готово
                </>
              ) : (
                <>
                  <Pencil size={15} /> Редагувати
                </>
              )}
            </button>
          </div>
        </div>

        <div className="course-progress">
          <span className="meter" aria-hidden>
            <i style={{ width: `${Math.min(100, (countedLessons(lessons) / (course.total_hours || 1)) * 100)}%` }} />
          </span>
          <span className="pill">
            <b className="num">{countedLessons(lessons)}</b>&nbsp;{lessonsWord(countedLessons(lessons))} з {course.total_hours} год
          </span>
          <span className="pill">{weeklyHours(course)} год/тиж</span>
          {classes.map((c) => (
            <span key={c.id} className="pill" style={{ background: color }}>
              {c.display_name}
            </span>
          ))}
        </div>

        {showSettings && (
          <CourseSettings
            course={course}
            onDeleted={() => navigate('/ktp')}
            onClose={() => setShowSettings(false)}
            topics={topics}
            lessons={lessons}
          />
        )}

        {!editing ? (
          <div className="ktp view">
            {blocks.map((b) => (
              <section key={b.topic.id} id={`topic-${b.topic.id}`} className="topic">
                <TopicHead block={b} warning={warnings.find((x) => x.topicId === b.topic.id)} />
                {b.lessons.map((l) => (
                  <ViewLesson
                    key={l.id}
                    lesson={l}
                    classes={classes}
                    schedules={scheduleById}
                    today={today}
                    color={color}
                    files={materialsOf(materials, l).own}
                    onMaterials={() => setMaterialsFor(l.id)}
                  />
                ))}
                {!b.lessons.length && <p className="ktp-empty">У темі ще немає уроків.</p>}
              </section>
            ))}
            {!blocks.length && (
              <p className="muted">
                КТП порожнє. Натисни «Редагувати», щоб додати теми й уроки, або імпортуй план з Word на сторінці КТП.
              </p>
            )}
          </div>
        ) : (
          <>
            <DndContext
              sensors={sensors}
              collisionDetection={collide}
              onDragStart={dragStart}
              onDragOver={dragOver}
              onDragEnd={dragEnd}
              onDragCancel={() => setDrag(null)}
            >
              <div className="ktp edit">
                <SortableContext items={blocks.map((b) => topicKey(b.topic.id))} strategy={verticalListSortingStrategy}>
                  {blocks.map((b) => (
                    <EditTopic
                      key={b.topic.id}
                      block={b}
                      warning={warnings.find((x) => x.topicId === b.topic.id)}
                      onRemove={() => removeTopic(b)}
                      onAddLesson={() => addLesson(b.topic)}
                    >
                      {b.lessons.map((l) => (
                        <EditLesson
                          key={l.id}
                          lesson={l}
                          classes={classes}
                          year={year}
                          schedules={scheduleById}
                          files={materialsOf(materials, l).own}
                          color={color}
                          autoFocus={l.id === newLessonId}
                          onType={(t) => setType(l, t)}
                          onMaterials={() => setMaterialsFor(l.id)}
                          onRemove={() => removeLesson(l)}
                        />
                      ))}
                    </EditTopic>
                  ))}
                </SortableContext>
              </div>
              <DragOverlay>
                {dragged && (
                  <div className="drag-ghost" style={{ background: color }}>
                    {'title' in dragged && 'lesson_type' in dragged ? (
                      <>
                        <b>{lessonNo(dragged)}</b> {dragged.title || 'Без теми'}
                      </>
                    ) : (
                      <b>{dragged.title}</b>
                    )}
                  </div>
                )}
              </DragOverlay>
            </DndContext>
            <button className="add-topic" onClick={addTopic}>
              <Plus size={16} /> Нова тема
            </button>
          </>
        )}

        {materialsFor && lessons.some((l) => l.id === materialsFor) && (
          <MaterialsDialog
            course={course}
            year={year}
            lesson={lessons.find((l) => l.id === materialsFor)!}
            materials={materials}
            onClose={() => setMaterialsFor(null)}
          />
        )}
      </main>
    </div>
  )
}

// ---------- Режим перегляду ----------

type TopicHeadProps = { block: TopicBlock; warning?: Warning }

function TopicHead({ block, warning }: TopicHeadProps) {
  const count = countedLessons(block.lessons)
  return (
    <div className="topic-row">
      <h2 className="topic-title">
        {block.topic.title}
        <span className="hours">
          {block.topic.planned_hours > 0
            ? `${count} / ${block.topic.planned_hours} год`
            : `${count} ${lessonsWord(count)}`}
        </span>
      </h2>
      {warning && (
        <span className="badge warn-badge">
          <TriangleAlert size={12} /> {warning.text}
        </span>
      )}
    </div>
  )
}

/** ДЗ уроку: мітка «ДЗ» і текст; поле в режимі редагування стоїть там само. */
function Homework({ children }: { children: ReactNode }) {
  return (
    <div className="hw">
      <span className="hw-tag">ДЗ</span>
      {children}
    </div>
  )
}

type ViewLessonProps = {
  lesson: Lesson
  classes: ClassGroup[]
  schedules: Map<string, LessonSchedule>
  today: string
  color: string
  files: LessonMaterial[]
  onMaterials: () => void
}

function ViewLesson({ lesson: l, classes, schedules, today, color, files, onMaterials }: ViewLessonProps) {
  const label = l.lesson_type !== 'regular' ? typeLabel(l.lesson_type) : ''
  return (
    <div id={`lesson-${l.id}`} className={l.lesson_type === 'reserve' ? 'lesson-item reserve' : 'lesson-item'}>
      <span className="l-no num" style={{ background: color }} title={l.extra ? 'Не входить у нумерацію' : undefined}>
        {lessonNo(l)}
      </span>
      <div className="l-body">
        <p className="l-title">
          {l.title || <span className="placeholder">Без теми</span>}
          {label && <span className={`type-tag ${l.lesson_type}`}>{label}</span>}
        </p>
        {l.homework && (
          <Homework>
            <p className="hw-text">{l.homework}</p>
          </Homework>
        )}
        <LessonShelves own={files} onOpen={onMaterials} />
      </div>
      {classes.length > 0 && (
        <div className="l-pills">
          {classes.map((c) => {
            const d = schedules.get(`${l.id}_${c.id}`)?.planned_date
            if (!d) return null
            return (
              <span key={c.id} className={d < today ? 'date-pill past' : 'date-pill'}>
                <span>{c.display_name}</span> <b className="num">{shortDate(d)}</b>
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ---------- Режим редагування ----------

/** Ручка перетягування — окрема кнопка розміром з кнопку-іконку. */
function Grip({ label, handle }: { label: string; handle: HandleProps }) {
  return (
    <button type="button" className="grip" aria-label={label} title="Перетягни, щоб змінити порядок" {...handle}>
      <GripVertical size={16} />
    </button>
  )
}

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="icon-btn del" aria-label={label} title={label} onClick={onClick}>
      <Trash2 size={16} />
    </button>
  )
}

type EditTopicProps = {
  block: TopicBlock
  warning?: Warning
  onRemove: () => void
  onAddLesson: () => void
  children: ReactNode
}

function EditTopic({ block: b, warning, onRemove, onAddLesson, children }: EditTopicProps) {
  const { ref: sortRef, style, dragging, handle } = useSortableItem(topicKey(b.topic.id))
  const { setNodeRef: endRef } = useDroppable({ id: endKey(b.topic.id) })
  return (
    <section id={`topic-${b.topic.id}`} ref={sortRef} className={dragging ? 'topic lifted' : 'topic'} style={style}>
      <div className="topic-row">
        <Grip label={`Перемістити тему «${b.topic.title}»`} handle={handle} />
        <InlineText
          fitContent
          className="topic-title"
          label="Назва теми"
          value={b.topic.title}
          onSave={(title) => title && updateFields('topics', b.topic.id, { title })}
        />
        <label className="hours" title="Годин за програмою">
          <span className="num">{countedLessons(b.lessons)}</span> /
          <input
            className="cell num"
            inputMode="numeric"
            aria-label="Годин за програмою"
            defaultValue={b.topic.planned_hours || ''}
            key={b.topic.planned_hours}
            placeholder="0"
            onBlur={(e) => {
              const n = Math.max(0, Math.round(Number(e.target.value) || 0))
              if (n !== b.topic.planned_hours) updateFields('topics', b.topic.id, { planned_hours: n })
            }}
          />
          год
        </label>
        {warning && (
          <span className="badge warn-badge">
            <TriangleAlert size={12} /> {warning.text}
          </span>
        )}
        <span className="grow" />
        <RemoveButton label={`Видалити тему «${b.topic.title}»`} onClick={onRemove} />
      </div>

      <SortableContext items={b.lessons.map((l) => lessonKey(l.id))} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>

      <div ref={endRef} className="topic-end">
        <button className="link-btn add-lesson" onClick={onAddLesson}>
          <Plus size={14} /> Урок
        </button>
      </div>
    </section>
  )
}

/** Вибір типу уроку: пігулка кольору типу з меню застосунку замість системного списку. */
function TypePicker({ value, onChange }: { value: LessonType; onChange: (t: LessonType) => void }) {
  const item = (t: (typeof LESSON_TYPES)[number]): MenuItem => ({
    label: t.label,
    swatch: TYPE_SWATCH[t.value],
    checked: t.value === value,
    hint: t.value === 'reserve' ? 'без номера' : undefined,
    onSelect: () => t.value !== value && onChange(t.value),
  })
  return (
    <Menu
      label="Тип уроку"
      triggerClass={`type-btn ${value}`}
      trigger={
        <>
          {typeLabel(value) || 'Урок'} <ChevronDown size={12} />
        </>
      }
      groups={[LESSON_TYPES.filter((t) => t.value !== 'reserve').map(item), LESSON_TYPES.filter((t) => t.value === 'reserve').map(item)]}
    />
  )
}

type EditLessonProps = {
  lesson: Lesson
  classes: ClassGroup[]
  year?: AcademicYear
  schedules: Map<string, LessonSchedule>
  files: LessonMaterial[]
  color: string
  autoFocus: boolean
  onType: (t: LessonType) => void
  onMaterials: () => void
  onRemove: () => void
}

/** Урок у режимі редагування — той самий рядок, що й у перегляді, але з полями, ручкою й кошиком. */
function EditLesson(props: EditLessonProps) {
  const { lesson: l, classes, year, schedules, files, color, autoFocus, onType, onMaterials, onRemove } = props
  const { ref: sortRef, style, dragging, handle } = useSortableItem(lessonKey(l.id))
  const cls = ['lesson-item', 'editing', l.lesson_type === 'reserve' && 'reserve', dragging && 'placeholder-row']
  return (
    <div ref={sortRef} className={cls.filter(Boolean).join(' ')} style={style}>
      <Grip label={`Перемістити урок ${lessonNo(l)}`} handle={handle} />
      <span className="l-no num" style={{ background: color }}>
        {lessonNo(l)}
      </span>
      <div className="l-body">
        <div className="l-head">
          <InlineText
            multiline
            autoFocus={autoFocus}
            className="l-title"
            label={`Тема уроку ${lessonNo(l)}`}
            placeholder="Тема уроку"
            value={l.title}
            onSave={(title) => updateFields('lessons', l.id, { title })}
          />
          <span className="type-desk">
            <TypePicker value={l.lesson_type} onChange={onType} />
          </span>
        </div>
        <Homework>
          <InlineText
            multiline
            className="hw-text"
            label={`ДЗ до уроку ${lessonNo(l)}`}
            placeholder="Додати домашнє завдання"
            value={l.homework}
            onSave={(homework) => updateFields('lessons', l.id, { homework })}
          />
        </Homework>
        <LessonShelves own={files} onOpen={onMaterials} />
      </div>
      <div className="l-pills">
        {/* На телефоні тип уроку стоїть у ряду дат, щоб не налазити на назву. */}
        <span className="type-phone">
          <TypePicker value={l.lesson_type} onChange={onType} />
        </span>
        {classes.map((c) => (
          <DateCell key={c.id} lesson={l} cls={c} year={year} schedule={schedules.get(`${l.id}_${c.id}`)} />
        ))}
      </div>
      <RemoveButton label={`Видалити урок ${lessonNo(l)}`} onClick={onRemove} />
    </div>
  )
}

type DateCellProps = { lesson: Lesson; cls: ClassGroup; year?: AcademicYear; schedule?: LessonSchedule }

/** Дата уроку для одного класу; порожньо — урок цьому класу не призначено. */
function DateCell({ lesson, cls, year, schedule }: DateCellProps) {
  const stored = schedule?.planned_date ?? null

  function save(date: string | null) {
    const id = `${lesson.id}_${cls.id}`
    if (!date) removeDoc('lesson_schedules', id)
    else if (schedule) updateFields('lesson_schedules', id, { planned_date: date })
    else
      putDoc('lesson_schedules', id, {
        course_id: lesson.course_id,
        lesson_id: lesson.id,
        class_group_id: cls.id,
        planned_date: date,
        actual_date: null,
        status: 'planned',
        note: '',
      })
  }

  return (
    <span className={stored ? 'date-pill' : 'date-pill empty'}>
      <span>{cls.display_name}</span>
      <DatePicker
        compact
        clearable
        label={`Дата уроку ${lessonNo(lesson)} для ${cls.display_name}`}
        value={stored}
        min={year?.start_date}
        max={year?.end_date}
        onChange={save}
      />
    </span>
  )
}
