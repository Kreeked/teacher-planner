import { getDocs, query, serverTimestamp, where } from 'firebase/firestore'
import { auth } from '../lib/firebase'
import { BatchWriter, col, createDoc, newRef, ref, updateFields } from '../data/db'
import { groupLessons, renumber } from '../data/ktp'
import type { AcademicYear, ClassGroup, Collections, Course, Lesson, Period, Topic } from '../data/types'
import { classDisplayName, ROMAN, validatePeriod } from '../data/year'
import { sameTitle, type ParsedKtp } from './ktpParser'

async function load<N extends keyof Collections>(name: N, field: string, value: string) {
  const snap = await getDocs(query(col(name), where(field, '==', value)))
  return snap.docs.map((d) => ({ ...(d.data() as object), id: d.id }) as Collections[N])
}

// Латинські двійники кириличних літер у назвах класів.
const LATIN: Record<string, string> = { A: 'А', B: 'В', C: 'С', E: 'Е', H: 'Н', I: 'І', K: 'К', M: 'М', O: 'О', P: 'Р', T: 'Т', X: 'Х' }
function splitClassName(name: string) {
  const m = name.match(/^(\d+)\s*-?\s*(.*)$/)
  const letter = (m?.[2] ?? '')
    .toUpperCase()
    .split('')
    .map((ch) => LATIN[ch] ?? ch)
    .join('')
  return { grade: Number(m?.[1]), letter }
}

function semesterOf(p: Period) {
  const m = p.title.match(/^(ІІ|II|І|I|1|2)/i)
  return m ? ({ І: 1, I: 1, '1': 1, ІІ: 2, II: 2, '2': 2 } as Record<string, number>)[m[1].toUpperCase()] : null
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').replace(/[.;]\s*$/, '').trim()

export type ImportSummary = {
  courseId: string
  classes: number
  topics: number
  lessons: number
  skipped: number
  outcomes: number
  dates: number
}

/**
 * Записує розібране КТП: класи, семестр, курс (новий або наявний), теми, уроки, ОРН і дати по класах.
 * Уроки, що вже є в цій темі з такою самою назвою, пропускаються — повторний імпорт нічого не дублює.
 */
export async function applyImport(
  k: ParsedKtp,
  year: AcademicYear,
  target: Course | null,
): Promise<ImportSummary> {
  const uid = auth.currentUser!.uid
  const w = new BatchWriter()
  const sum: ImportSummary = { courseId: '', classes: 0, topics: 0, lessons: 0, skipped: 0, outcomes: 0, dates: 0 }

  // ---------- Класи ----------
  const classes = await load('class_groups', 'academic_year_id', year.id)
  const classIds = k.classNames.map((name) => {
    const { grade, letter } = splitClassName(name)
    const display = classDisplayName(grade, letter)
    const found = classes.find((c: ClassGroup) => c.display_name === display)
    if (found) return found.id
    sum.classes++
    const id = createDoc('class_groups', { academic_year_id: year.id, grade, letter, display_name: display }, w.batch)
    classes.push({ id, owner_id: uid, academic_year_id: year.id, grade, letter, display_name: display })
    return id
  })

  // ---------- Семестри ----------
  const periods = await load('periods', 'academic_year_id', year.id)
  const semesterIds = new Map<number, string>()
  for (const s of k.semesters) {
    const found = periods.find((p) => !p.parent_id && semesterOf(p) === s.number)
    if (found) {
      semesterIds.set(s.number, found.id)
      continue
    }
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

  const links = target ? await load('course_classes', 'course_id', courseId) : []
  for (const id of classIds)
    if (!links.some((l) => l.class_group_id === id)) {
      createDoc('course_classes', { course_id: courseId, class_group_id: id, weekdays: [], position: links.length }, w.batch)
      links.push({ id: '', owner_id: uid, course_id: courseId, class_group_id: id, weekdays: [], position: links.length })
    }

  // ---------- Теми, уроки, ОРН ----------
  const topics: Topic[] = target ? await load('topics', 'course_id', courseId) : []
  const lessons: Lesson[] = target ? await load('lessons', 'course_id', courseId) : []
  const outcomes = target ? await load('learning_outcomes', 'course_id', courseId) : []
  const outcomeIds = new Map(outcomes.map((o) => [norm(o.text), o.id]))
  const newLessons = new Map<string, Omit<Lesson, 'id' | 'owner_id'>>()

  for (const pt of k.topics) {
    let topic = topics.find((t) => sameTitle(t.title, pt.title) || (pt.altTitle !== null && sameTitle(t.title, pt.altTitle)))
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
      if (inTopic.some((l) => sameTitle(l.title, pl.title))) {
        sum.skipped++
        continue
      }
      const ids = pl.outcomes.map((text) => {
        const key = norm(text)
        let id = outcomeIds.get(key)
        if (!id) {
          id = createDoc('learning_outcomes', { course_id: courseId, text, position: outcomeIds.size }, w.batch)
          outcomeIds.set(key, id)
          sum.outcomes++
        }
        return id
      })
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
        outcome_ids: [...new Set(ids)],
        extra: pl.number === null,
      }
      // Запис уроку — нижче, коли буде відомий його наскрізний номер.
      const r = newRef('lessons')
      newLessons.set(r.id, data)
      lessons.push({ ...data, id: r.id, owner_id: uid })
      sum.lessons++

      pl.dates.forEach((date, i) => {
        if (!date) return
        const classId = classIds[i]
        w.batch.set(ref('lesson_schedules', `${r.id}_${classId}`), {
          course_id: courseId,
          lesson_id: r.id,
          class_group_id: classId,
          planned_date: date,
          actual_date: null,
          status: 'planned',
          note: '',
          owner_id: uid,
          created_at: serverTimestamp(),
          updated_at: serverTimestamp(),
        })
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
