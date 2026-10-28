import { ArrowLeft, ChevronDown, ChevronUp, ListChecks, Plus, Settings2, Trash2, TriangleAlert } from 'lucide-react'
import { useState, type CSSProperties } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { InlineText } from '../../components/InlineText'
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
  moveLesson,
  moveTopic,
  renumber,
  type TopicBlock,
} from '../../data/ktp'
import type { AcademicYear, ClassGroup, Lesson, LessonSchedule, LessonType, Topic } from '../../data/types'
import { gradeColor, parseShortDate, shortDate } from '../../data/year'
import { CourseSettings } from './CourseSettings'
import { MaterialsButton, MaterialsDialog } from './Materials'
import type { WriteBatch } from 'firebase/firestore'

/** Записує новий порядок: позиції тем і номери/позиції уроків, що змінилися. */
function applyOrder(blocks: TopicBlock[], batch: WriteBatch, skip?: string) {
  blocks.forEach(({ topic }, i) => {
    if (topic.position !== i && topic.id !== skip) updateFields('topics', topic.id, { position: i }, batch)
  })
  for (const { id, ...patch } of renumber(blocks)) if (id !== skip) updateFields('lessons', id, patch, batch)
}

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
  const { items: tests } = useCollection('tests', byCourse)
  const [showSettings, setShowSettings] = useState(false)
  const [materialsFor, setMaterialsFor] = useState<{ lessonId?: string; topicId?: string } | null>(null)
  // Щойно доданий урок отримує фокус на полі теми.
  const [newLessonId, setNewLessonId] = useState<string | null>(null)

  if (loading) return null
  if (!course)
    return (
      <div className="page">
        <main className="main">
          <Link to="/ktp" className="back">
            <ArrowLeft size={14} /> КТП
          </Link>
          <h1>КТП не знайдено</h1>
        </main>
      </div>
    )

  const blocks = groupLessons(topics, lessons)
  const warnings = hourWarnings(blocks, course.total_hours)
  const courseWarning = warnings.find((w) => !w.topicId)
  const color = gradeColor(course.grade)
  const year = years.find((y) => y.id === course.academic_year_id)
  // Колонки дат — класи курсу в порядку прив'язки.
  const classes = [...links]
    .sort((a, b) => a.position - b.position)
    .map((l) => yearClasses.find((c) => c.id === l.class_group_id))
    .filter((c): c is ClassGroup => !!c)
  const scheduleById = new Map(schedules.map((s) => [s.id, s]))
  const gridStyle = classes.length ? ({ '--date-cols': `repeat(${classes.length}, 58px)` } as CSSProperties) : undefined
  const flat = blocks.flatMap((b) => b.lessons)

  function addTopic() {
    createDoc('topics', {
      course_id: courseId,
      position: blocks.length,
      title: `Тема ${blocks.length + 1}`,
      planned_hours: 0,
    })
  }

  function addLesson(topic: Topic) {
    const batch = newBatch()
    const block = blocks.find((b) => b.topic.id === topic.id)!
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
    const next = blocks.map((b) =>
      b.topic.id === topic.id ? { ...b, lessons: [...b.lessons, { ...draft, id, owner_id: '' }] } : b,
    )
    // Номер нового уроку записуємо одразу, решту — зсуваємо.
    const own = renumber(next).find((p) => p.id === id)
    if (own) updateFields('lessons', id, { number: own.number }, batch)
    applyOrder(next, batch, id)
    commit(batch)
    setNewLessonId(id)
  }

  async function removeLesson(l: Lesson) {
    if (l.title && !confirm(`Видалити урок ${l.extra ? '*' : l.number} «${l.title}»?`)) return
    const batch = newBatch()
    batch.delete(ref('lessons', l.id))
    applyOrder(
      blocks.map((b) => ({ ...b, lessons: b.lessons.filter((x) => x.id !== l.id) })),
      batch,
    )
    commit(batch)
    deleteRefs([
      ...(await refsWhere('lesson_schedules', 'lesson_id', l.id)),
      ...(await refsWhere('lesson_materials', 'lesson_id', l.id)),
    ])
    // Тести уроку не видаляємо: вони переходять до його теми.
    for (const r of await refsWhere('tests', 'lesson_id', l.id))
      updateFields('tests', r.id, { lesson_id: null, topic_id: l.topic_id })
  }

  async function removeTopic(b: TopicBlock) {
    const msg = b.lessons.length
      ? `Видалити тему «${b.topic.title}» разом із ${b.lessons.length} ${lessonsWord(b.lessons.length)}?`
      : `Видалити тему «${b.topic.title}»?`
    if (!confirm(msg)) return
    const batch = newBatch()
    batch.delete(ref('topics', b.topic.id))
    for (const l of b.lessons) batch.delete(ref('lessons', l.id))
    applyOrder(
      blocks.filter((x) => x.topic.id !== b.topic.id),
      batch,
    )
    commit(batch)
    deleteRefs(await refsWhere('lesson_materials', 'topic_id', b.topic.id))
    // Тести теми та її уроків лишаються в курсі без прив'язки.
    for (const r of await refsWhere('tests', 'topic_id', b.topic.id)) updateFields('tests', r.id, { topic_id: null })
    for (const l of b.lessons) {
      deleteRefs([
        ...(await refsWhere('lesson_schedules', 'lesson_id', l.id)),
        ...(await refsWhere('lesson_materials', 'lesson_id', l.id)),
      ])
      for (const r of await refsWhere('tests', 'lesson_id', l.id)) updateFields('tests', r.id, { lesson_id: null })
    }
  }

  function reorder(next: TopicBlock[]) {
    const batch = newBatch()
    applyOrder(next, batch)
    commit(batch)
  }

  return (
    <div className="page">
      <main className="main">
        <Link to="/ktp" className="back">
          <ArrowLeft size={14} /> КТП
        </Link>
        <div className="sec-head">
          <h1>{courseTitle(course)}</h1>
          <span className="grow" />
          <Link to={`/ktp/${courseId}/tests`} className="chip plain">
            <ListChecks size={14} /> Тести{tests.length > 0 && ` (${tests.length})`}
          </Link>
          <button
            className={showSettings ? 'chip plain on' : 'chip plain'}
            onClick={() => setShowSettings(!showSettings)}
            aria-expanded={showSettings}
          >
            <Settings2 size={14} /> Параметри
          </button>
        </div>

        <div className="chips">
          <span className="chip plain" style={{ background: color }}>
            {countedLessons(lessons)} {lessonsWord(countedLessons(lessons))} з {course.total_hours} год
          </span>
          <span className="chip plain">{course.hours_per_week} год/тиж</span>
        </div>

        {showSettings && (
          <CourseSettings course={course} onDeleted={() => navigate('/ktp')} topics={topics} lessons={lessons} />
        )}

        {courseWarning && (
          <p className="warn">
            <TriangleAlert size={14} /> {courseWarning.text}
          </p>
        )}

        <div className="ktp">
          <div className="ktp-head" style={gridStyle}>
            <span>№</span>
            <span>Тема уроку</span>
            {classes.map((c) => (
              <span key={c.id} className="date-head">
                {c.display_name}
              </span>
            ))}
            <span>Тип</span>
            <span>Домашнє завдання</span>
          </div>

          {blocks.map((b, bi) => {
            const w = warnings.find((x) => x.topicId === b.topic.id)
            return (
              <section key={b.topic.id} className="topic" style={{ background: color }}>
                <div className="topic-row">
                  <InlineText
                    className="topic-title"
                    label="Назва теми"
                    value={b.topic.title}
                    onSave={(title) => title && updateFields('topics', b.topic.id, { title })}
                  />
                  <label className="hours" title="Годин за програмою">
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
                  {w && (
                    <span className="badge warn-badge">
                      <TriangleAlert size={12} /> {w.text}
                    </span>
                  )}
                  <span className="grow" />
                  <span className="row-tools">
                    <MaterialsButton
                      count={materials.filter((m) => m.topic_id === b.topic.id && !m.lesson_id).length}
                      label="Матеріали теми"
                      onClick={() => setMaterialsFor({ topicId: b.topic.id })}
                    />
                    <button
                      className="icon-btn"
                      disabled={bi === 0}
                      onClick={() => reorder(moveTopic(blocks, b.topic.id, -1))}
                      aria-label="Тему вище"
                    >
                      <ChevronUp size={15} />
                    </button>
                    <button
                      className="icon-btn"
                      disabled={bi === blocks.length - 1}
                      onClick={() => reorder(moveTopic(blocks, b.topic.id, 1))}
                      aria-label="Тему нижче"
                    >
                      <ChevronDown size={15} />
                    </button>
                    <button className="icon-btn del" onClick={() => removeTopic(b)} aria-label="Видалити тему">
                      <Trash2 size={15} />
                    </button>
                  </span>
                </div>

                {b.lessons.map((l) => (
                  <div key={l.id} className="lesson-row" style={gridStyle}>
                    <span className="no num" title={l.extra ? 'Додатковий урок для частини класів' : undefined}>
                      {l.extra ? '*' : l.number}
                    </span>
                    <div className="l-main">
                      <InlineText
                        multiline
                        autoFocus={l.id === newLessonId}
                        className="l-title"
                        label={`Тема уроку ${l.number}`}
                        placeholder="Тема уроку"
                        value={l.title}
                        onSave={(title) => updateFields('lessons', l.id, { title })}
                      />
                    </div>
                    {classes.length > 0 && (
                      <div className="l-dates">
                        {classes.map((c) => (
                          <DateCell
                            key={c.id}
                            lesson={l}
                            cls={c}
                            year={year}
                            schedule={scheduleById.get(`${l.id}_${c.id}`)}
                          />
                        ))}
                      </div>
                    )}
                    <select
                      className="cell l-type"
                      aria-label="Тип уроку"
                      value={l.lesson_type}
                      onChange={(e) => updateFields('lessons', l.id, { lesson_type: e.target.value as LessonType })}
                    >
                      {LESSON_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                    <InlineText
                      multiline
                      className="l-hw"
                      label={`ДЗ до уроку ${l.number}`}
                      placeholder="ДЗ"
                      value={l.homework}
                      onSave={(homework) => updateFields('lessons', l.id, { homework })}
                    />
                    <span className="row-tools">
                      <MaterialsButton
                        count={materials.filter((m) => m.lesson_id === l.id).length}
                        label={`Матеріали уроку ${l.extra ? '*' : l.number}`}
                        onClick={() => setMaterialsFor({ lessonId: l.id })}
                      />
                      <button
                        className="icon-btn"
                        disabled={flat[0]?.id === l.id}
                        onClick={() => reorder(moveLesson(blocks, l.id, -1))}
                        aria-label="Урок вище"
                      >
                        <ChevronUp size={15} />
                      </button>
                      <button
                        className="icon-btn"
                        disabled={flat[flat.length - 1]?.id === l.id}
                        onClick={() => reorder(moveLesson(blocks, l.id, 1))}
                        aria-label="Урок нижче"
                      >
                        <ChevronDown size={15} />
                      </button>
                      <button className="icon-btn del" onClick={() => removeLesson(l)} aria-label="Видалити урок">
                        <Trash2 size={15} />
                      </button>
                    </span>
                  </div>
                ))}

                <button className="link-btn add-lesson" onClick={() => addLesson(b.topic)}>
                  <Plus size={14} /> Урок
                </button>
              </section>
            )
          })}
        </div>

        <button className="btn ghost add-topic" onClick={addTopic}>
          <Plus size={16} /> Тема
        </button>

        {materialsFor && (
          <MaterialsDialog
            course={course}
            year={year}
            lesson={lessons.find((l) => l.id === materialsFor.lessonId)}
            topic={topics.find((t) => t.id === materialsFor.topicId)}
            materials={materials}
            onClose={() => setMaterialsFor(null)}
          />
        )}
      </main>
    </div>
  )
}

type DateCellProps = { lesson: Lesson; cls: ClassGroup; year?: AcademicYear; schedule?: LessonSchedule }

/** Дата уроку для одного класу: «дд.мм», порожньо — урок цьому класу не призначено. */
function DateCell({ lesson, cls, year, schedule }: DateCellProps) {
  const stored = schedule?.planned_date ?? null
  const shown = stored ? shortDate(stored) : ''

  function save(input: HTMLInputElement) {
    if (!year) return
    const date = parseShortDate(input.value, year)
    if (date === undefined) {
      input.value = shown
      return
    }
    input.value = date ? shortDate(date) : ''
    if (date === stored) return
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
    <label className="l-date">
      <span className="l-date-class">{cls.display_name}</span>
      <input
        className="cell num"
        inputMode="decimal"
        aria-label={`Дата уроку ${lesson.extra ? '*' : lesson.number} для ${cls.display_name}`}
        placeholder="—"
        defaultValue={shown}
        key={shown}
        onBlur={(e) => save(e.target)}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
    </label>
  )
}
