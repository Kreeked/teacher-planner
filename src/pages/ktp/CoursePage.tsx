import { ArrowLeft, ArrowUpRight, ChevronDown, ChevronUp, Plus, Settings2, Target, Trash2, TriangleAlert, X } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { InlineText } from '../../components/InlineText'
import { commit, createDoc, deleteRefs, newBatch, ref, refsWhere, updateFields, useCollection } from '../../data/db'
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
import type { Lesson, LessonType, Topic } from '../../data/types'
import { coverage, outcomeUsage, sortOutcomes } from '../../data/outcomes'
import { gradeColor } from '../../data/year'
import { CourseSettings } from './CourseSettings'
import { OutcomePicker } from './OutcomePicker'
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
  const { items: outcomes } = useCollection('learning_outcomes', byCourse)
  const [showSettings, setShowSettings] = useState(false)
  const [pickerFor, setPickerFor] = useState<string | null>(null)
  // Щойно доданий урок отримує фокус на полі теми.
  const [newLessonId, setNewLessonId] = useState<string | null>(null)

  const course = courses.find((c) => c.id === courseId)
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
  const usage = outcomeUsage(lessons)
  const stats = coverage(outcomes, lessons)
  const outcomeById = new Map(sortOutcomes(outcomes).map((o, i) => [o.id, { ...o, n: i + 1 }]))
  const pickerLesson = lessons.find((l) => l.id === pickerFor)
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
    deleteRefs(await refsWhere('lesson_schedules', 'lesson_id', l.id))
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
    for (const l of b.lessons) deleteRefs(await refsWhere('lesson_schedules', 'lesson_id', l.id))
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
          <Link to={`/ktp/${courseId}/outcomes`} className="chip plain">
            <Target size={14} /> ОРН: покрито {stats.covered} з {stats.total} <ArrowUpRight size={13} />
          </Link>
        </div>

        {showSettings && (
          <CourseSettings
            course={course}
            onDeleted={() => navigate('/ktp')}
            topics={topics}
            lessons={lessons}
          />
        )}

        {courseWarning && (
          <p className="warn">
            <TriangleAlert size={14} /> {courseWarning.text}
          </p>
        )}
        {stats.total > 0 && stats.lessonsWithout > 0 && (
          <p className="warn">
            <TriangleAlert size={14} /> Без ОРН: {stats.lessonsWithout} {lessonsWord(stats.lessonsWithout)}
          </p>
        )}
        {stats.total > stats.covered && (
          <p className="warn">
            <TriangleAlert size={14} /> Не прив'язано до уроків: {stats.total - stats.covered} ОРН
          </p>
        )}

        <div className="ktp">
          <div className="ktp-head">
            <span>№</span>
            <span>Тема уроку</span>
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
                    <button className="icon-btn" disabled={bi === 0} onClick={() => reorder(moveTopic(blocks, b.topic.id, -1))} aria-label="Тему вище">
                      <ChevronUp size={15} />
                    </button>
                    <button className="icon-btn" disabled={bi === blocks.length - 1} onClick={() => reorder(moveTopic(blocks, b.topic.id, 1))} aria-label="Тему нижче">
                      <ChevronDown size={15} />
                    </button>
                    <button className="icon-btn del" onClick={() => removeTopic(b)} aria-label="Видалити тему">
                      <Trash2 size={15} />
                    </button>
                  </span>
                </div>

                {b.lessons.map((l) => (
                  <div key={l.id} className="lesson-row">
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
                      <div className="l-outcomes">
                        {(l.outcome_ids ?? []).map((id) => {
                          const o = outcomeById.get(id)
                          if (!o) return null
                          return (
                            <span key={id} className="orn" title={o.text}>
                              <span className="grow">{o.text}</span>
                              <button
                                className="chip-x"
                                aria-label="Прибрати ОРН"
                                onClick={() =>
                                  updateFields('lessons', l.id, { outcome_ids: l.outcome_ids!.filter((x) => x !== id) })
                                }
                              >
                                <X size={11} />
                              </button>
                            </span>
                          )
                        })}
                        <button className="link-btn" onClick={() => setPickerFor(l.id)}>
                          <Plus size={12} /> ОРН
                        </button>
                      </div>
                    </div>
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

        {pickerLesson && (
          <OutcomePicker lesson={pickerLesson} outcomes={outcomes} usage={usage} onClose={() => setPickerFor(null)} />
        )}
      </main>
    </div>
  )
}
