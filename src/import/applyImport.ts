import { serverTimestamp } from 'firebase/firestore'
import { auth } from '../lib/firebase'
import { BatchWriter, createDoc, newRef, ref, updateFields } from '../data/db'
import { groupLessons, renumber } from '../data/ktp'
import type { AcademicYear, Course, Lesson, LessonSchedule } from '../data/types'
import { ROMAN, validatePeriod } from '../data/year'
import { sameTitle, type ParsedKtp, type ParsedLesson } from './ktpParser'
import { findTopic, isReplaced, scheduleId, semesterOf, type Decisions, type ImportContext, type ImportPlan } from './plan'

export type ImportSummary = {
  courseId: string
  classes: number
  topics: number
  lessons: number
  skipped: number
  dates: number // нових дат
  replaced: number // дат, замінених датами з файлу
  kept: number // дат, що розходилися з файлом і лишилися як були
}

/**
 * Записує розібране КТП: класи й семестри (лише ті, які дозволив користувач), курс (новий або наявний),
 * теми, уроки і дати по класах. Уроки, що вже є в темі з такою самою назвою, не дублюються:
 * їм лише додаються порожні дати, а ті, що розходяться з файлом, — за вибором користувача.
 */
export async function applyImport(
  k: ParsedKtp,
  year: AcademicYear,
  target: Course | null,
  ctx: ImportContext,
  plan: ImportPlan,
  decisions: Decisions,
): Promise<ImportSummary> {
  const uid = auth.currentUser!.uid
  const w = new BatchWriter()
  const sum: ImportSummary = { courseId: '', classes: 0, topics: 0, lessons: 0, skipped: 0, dates: 0, replaced: 0, kept: 0 }

  // ---------- Класи ----------
  const created = new Map<string, string>()
  const classIds = plan.classes.map((c) => {
    if (c.classId) return c.classId
    if (!decisions.addClasses.has(c.index)) return null
    let id = created.get(c.display)
    if (!id) {
      sum.classes++
      id = createDoc(
        'class_groups',
        { academic_year_id: year.id, grade: c.grade, letter: c.letter, display_name: c.display },
        w.batch,
      )
      created.set(c.display, id)
    }
    return id
  })

  // ---------- Семестри ----------
  const periods = [...ctx.periods]
  const semesterIds = new Map<number, string>()
  for (const s of k.semesters) {
    const found = periods.find((p) => !p.parent_id && semesterOf(p) === s.number)
    if (found) {
      semesterIds.set(s.number, found.id)
      continue
    }
    if (!decisions.addSemesters.has(s.number)) continue
    const draft = { parent_id: null, start_date: s.start, end_date: s.end }
    if (validatePeriod(draft, year, periods)) continue
    const title = `${ROMAN[s.number - 1]} семестр`
    const position = periods.filter((p) => !p.parent_id).length
    const id = createDoc(
      'periods',
      { academic_year_id: year.id, kind: 'semester', title, position, ...draft },
      w.batch,
    )
    periods.push({ id, owner_id: uid, academic_year_id: year.id, kind: 'semester', title, position, ...draft })
    semesterIds.set(s.number, id)
  }

  // ---------- Курс ----------
  let courseId: string
  if (target) {
    courseId = target.id
    const patch: Partial<Course> = {}
    if (k.yearTotal && k.yearTotal !== target.total_hours && k.semesters.every((s) => s.number === 1))
      patch.total_hours = k.yearTotal
    if (!target.program_ref && k.programRef) patch.program_ref = k.programRef
    if (Object.keys(patch).length) updateFields('courses', courseId, patch, w.batch)
  } else {
    const total = k.yearTotal ?? k.topics.reduce((n, t) => n + t.lessons.filter((l) => l.number !== null).length, 0)
    courseId = createDoc(
      'courses',
      {
        academic_year_id: year.id,
        subject: k.subject,
        grade: k.grade,
        hours_per_week: Math.max(0.5, Math.round((total / 35) * 2) / 2),
        total_hours: total,
        program_ref: k.programRef,
        status: 'draft',
      },
      w.batch,
    )
  }
  sum.courseId = courseId

  const links = [...ctx.links]
  for (const id of classIds)
    if (id && !links.some((l) => l.class_group_id === id)) {
      createDoc('course_classes', { course_id: courseId, class_group_id: id, position: links.length }, w.batch)
      links.push({ id: '', owner_id: uid, course_id: courseId, class_group_id: id, position: links.length })
    }

  function putSchedule(lessonId: string, classId: string, date: string) {
    w.batch.set(ref('lesson_schedules', scheduleId(lessonId, classId)), {
      course_id: courseId,
      lesson_id: lessonId,
      class_group_id: classId,
      planned_date: date,
      actual_date: null,
      status: 'planned',
      note: '',
      owner_id: uid,
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
    })
  }

  // Дати наявного уроку: порожні заповнюємо, ті, що розходяться з файлом, — як вирішив користувач.
  function mergeDates(lessonId: string, pl: ParsedLesson) {
    pl.dates.forEach((date, i) => {
      const classId = classIds[i]
      if (!date || !classId) return
      const id = scheduleId(lessonId, classId)
      const cur: LessonSchedule | undefined = ctx.schedules.find((x) => x.id === id)
      if (!cur) {
        putSchedule(lessonId, classId, date)
        sum.dates++
      } else if (!cur.planned_date) {
        updateFields('lesson_schedules', id, { planned_date: date }, w.batch)
        sum.dates++
      } else if (cur.planned_date !== date) {
        const conflict = plan.conflicts.find((c) => c.key === id)
        if (conflict && isReplaced(conflict, decisions)) {
          updateFields('lesson_schedules', id, { planned_date: date }, w.batch)
          sum.replaced++
        } else sum.kept++
      }
    })
  }

  // ---------- Теми й уроки ----------
  const topics = [...ctx.topics]
  const lessons: Lesson[] = [...ctx.lessons]
  const known = new Set(ctx.lessons.map((l) => l.id))
  const newLessons = new Map<string, Omit<Lesson, 'id' | 'owner_id'>>()

  for (const pt of k.topics) {
    let topic = findTopic(topics, pt)
    if (!topic) {
      const data = { course_id: courseId, position: topics.length, title: pt.title, planned_hours: pt.hours }
      const id = createDoc('topics', data, w.batch)
      topic = { ...data, id, owner_id: uid }
      topics.push(topic)
      sum.topics++
    } else if (!topic.planned_hours && pt.hours) {
      updateFields('topics', topic.id, { planned_hours: pt.hours }, w.batch)
    }

    for (const pl of pt.lessons) {
      const inTopic = lessons.filter((l) => l.topic_id === topic.id)
      const same = inTopic.find((l) => sameTitle(l.title, pl.title))
      if (same) {
        // Урок уже є: не дублюємо, лише донесемо дати з файлу.
        if (known.has(same.id)) mergeDates(same.id, pl)
        sum.skipped++
        continue
      }
      const data: Omit<Lesson, 'id' | 'owner_id'> = {
        course_id: courseId,
        topic_id: topic.id,
        period_id: (pl.semester && semesterIds.get(pl.semester)) || null,
        position: inTopic.length,
        number: 0,
        title: pl.title,
        lesson_type: pl.lesson_type,
        homework: pl.homework,
        notes: '',
        extra: pl.number === null,
      }
      // Запис уроку — нижче, коли буде відомий його наскрізний номер.
      const r = newRef('lessons')
      newLessons.set(r.id, data)
      lessons.push({ ...data, id: r.id, owner_id: uid })
      sum.lessons++

      pl.dates.forEach((date, i) => {
        const classId = classIds[i]
        if (!date || !classId) return
        putSchedule(r.id, classId, date)
        sum.dates++
      })
    }
  }

  // ---------- Наскрізна нумерація ----------
  const patches = new Map(renumber(groupLessons(topics, lessons)).map((p) => [p.id, p]))
  for (const [id, data] of newLessons) {
    const p = patches.get(id)
    w.batch.set(ref('lessons', id), {
      ...data,
      ...(p && { number: p.number, position: p.position }),
      owner_id: uid,
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
    })
    patches.delete(id)
  }
  for (const { id, ...patch } of patches.values()) updateFields('lessons', id, patch, w.batch)

  w.commit()
  return sum
}
