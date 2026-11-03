import { serverTimestamp } from 'firebase/firestore'
import { auth } from '../lib/firebase'
import { BatchWriter, createDoc, newRef, ref, updateFields } from '../data/db'
import { groupLessons, renumber } from '../data/ktp'
import type { Course, Lesson } from '../data/types'
import { sameTitle, type ParsedKtp } from './ktpParser'
import { findTopic, scheduleId, semesterOf, type ImportContext, type ImportPlan } from './plan'

export type ImportSummary = {
  topics: number
  lessons: number // нових
  updated: number // уроків, що вже були й переписані файлом
  dates: number // дат, записаних із файлу
}

/**
 * Записує розібране КТП у цей курс: теми, уроки і дати по його класах. Нічого в налаштуваннях року не створює:
 * класи, яких немає в КТП, і семестри, яких немає в році, пропускаються. Уроки, що вже є в темі з такою самою
 * назвою, переписуються даними з файлу (тип, ДЗ, семестр, дати); порожня дата з файлу наявну не стирає.
 */
export async function applyImport(
  k: ParsedKtp,
  target: Course,
  ctx: ImportContext,
  plan: ImportPlan,
): Promise<ImportSummary> {
  const uid = auth.currentUser!.uid
  const w = new BatchWriter()
  const sum: ImportSummary = { topics: 0, lessons: 0, updated: 0, dates: 0 }
  const courseId = target.id

  // Колонки дат: лише класи цього КТП.
  const classIds = plan.classes.map((c) => (c.classId && c.linked ? c.classId : null))
  const semesterIds = new Map<number, string>()
  for (const s of k.semesters) {
    const found = ctx.periods.find((p) => !p.parent_id && semesterOf(p) === s.number)
    if (found) semesterIds.set(s.number, found.id)
  }

  function putSchedule(lessonId: string, classId: string, date: string) {
    const id = scheduleId(lessonId, classId)
    const cur = ctx.schedules.find((x) => x.id === id)
    if (!cur) {
      w.batch.set(ref('lesson_schedules', id), {
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
    } else if (cur.planned_date !== date) updateFields('lesson_schedules', id, { planned_date: date }, w.batch)
    else return
    sum.dates++
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
    } else if (pt.hours && topic.planned_hours !== pt.hours) {
      updateFields('topics', topic.id, { planned_hours: pt.hours }, w.batch)
    }

    for (const pl of pt.lessons) {
      const inTopic = lessons.filter((l) => l.topic_id === topic.id)
      const same = inTopic.find((l) => sameTitle(l.title, pl.title))
      const period_id = (pl.semester && semesterIds.get(pl.semester)) || null
      if (same) {
        // Урок уже є: переписуємо його даними з файлу. Уроки, створені в цьому ж імпорті, не чіпаємо.
        if (!known.has(same.id)) continue
        const patch: Partial<Lesson> = {}
        if (same.lesson_type !== pl.lesson_type) patch.lesson_type = pl.lesson_type
        if (same.homework !== pl.homework) patch.homework = pl.homework
        if ((same.period_id ?? null) !== period_id) patch.period_id = period_id
        if (!!same.extra !== (pl.number === null)) patch.extra = pl.number === null
        if (Object.keys(patch).length) updateFields('lessons', same.id, patch, w.batch)
        pl.dates.forEach((date, i) => {
          const classId = classIds[i]
          if (date && classId) putSchedule(same.id, classId, date)
        })
        sum.updated++
        continue
      }
      const data: Omit<Lesson, 'id' | 'owner_id'> = {
        course_id: courseId,
        topic_id: topic.id,
        period_id,
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
        if (date && classId) putSchedule(r.id, classId, date)
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
