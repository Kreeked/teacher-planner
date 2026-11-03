import { dateProblem, type DateProblem, type ScheduleData } from '../data/mismatch'
import type { ClassGroup, Course, CourseClass, Lesson, LessonSchedule, Period, Topic } from '../data/types'
import { classDisplayName } from '../data/year'
import { sameTitle, type ParsedKtp, type ParsedTopic } from './ktpParser'

/** Що вже є в системі: імпорт нічого не створює в налаштуваннях року, а лише зіставляє файл із ними. */
export type ImportContext = ScheduleData & {
  classes: ClassGroup[] // класи року
  periods: Period[]
  links: CourseClass[] // класи цільового КТП
  topics: Topic[]
  lessons: Lesson[]
  schedules: LessonSchedule[] // дати цільового КТП
}

// Латинські двійники кириличних літер у назвах класів.
const LATIN: Record<string, string> = { A: 'А', B: 'В', C: 'С', E: 'Е', H: 'Н', I: 'І', K: 'К', M: 'М', O: 'О', P: 'Р', T: 'Т', X: 'Х' }
export function splitClassName(name: string) {
  const m = name.match(/^(\d+)\s*-?\s*(.*)$/)
  const letter = (m?.[2] ?? '')
    .toUpperCase()
    .split('')
    .map((ch) => LATIN[ch] ?? ch)
    .join('')
  return { grade: Number(m?.[1]), letter }
}

export function semesterOf(p: Period) {
  const m = p.title.match(/^(ІІ|II|І|I|1|2)/i)
  return m ? ({ І: 1, I: 1, '1': 1, ІІ: 2, II: 2, '2': 2 } as Record<string, number>)[m[1].toUpperCase()] : null
}

export function findTopic(topics: Topic[], pt: ParsedTopic) {
  return topics.find((t) => sameTitle(t.title, pt.title) || (pt.altTitle !== null && sameTitle(t.title, pt.altTitle)))
}

export const scheduleId = (lessonId: string, classId: string) => `${lessonId}_${classId}`

export type ClassPlan = {
  index: number // колонка класу у файлі
  display: string
  classId: string | null // null — такого класу немає в році
  // Клас прив'язаний до цього КТП: лише його колонка дат імпортується. Решта — тільки звіт, склад класів міняється на сторінці року.
  linked: boolean
}

export type SemesterPlan = { number: number; exists: boolean; differs: boolean }

export type Mismatch = { classIndex: number; total: number; bad: number; problems: Partial<Record<DateProblem, number>> }

export type ImportPlan = {
  classes: ClassPlan[]
  semesters: SemesterPlan[]
  mismatches: Mismatch[]
  error: string | null // файл не можна імпортувати в цей КТП
}

export function planImport(k: ParsedKtp, target: Course, ctx: ImportContext): ImportPlan {
  const classes = k.classNames.map((name, index): ClassPlan => {
    const { grade, letter } = splitClassName(name)
    const display = classDisplayName(grade, letter)
    const found = ctx.classes.find((c) => c.display_name === display)
    return { index, display, classId: found?.id ?? null, linked: !!found && ctx.links.some((l) => l.class_group_id === found.id) }
  })

  const semesters = k.semesters.map((s): SemesterPlan => {
    const found = ctx.periods.find((p) => !p.parent_id && semesterOf(p) === s.number)
    return { number: s.number, exists: !!found, differs: !!found && (found.start_date !== s.start || found.end_date !== s.end) }
  })

  // Дати з файлу проти розкладу: лише попередження, імпорт їх не змінює.
  const mismatches = classes.map((c): Mismatch => {
    const m: Mismatch = { classIndex: c.index, total: 0, bad: 0, problems: {} }
    if (!c.classId || !c.linked) return m
    for (const pt of k.topics)
      for (const pl of pt.lessons) {
        const date = pl.dates[c.index]
        if (!date) continue
        m.total++
        const problem = dateProblem(date, c.classId, target.id, ctx)
        if (!problem) continue
        m.bad++
        m.problems[problem] = (m.problems[problem] ?? 0) + 1
      }
    return m
  })

  const error = k.grade !== target.grade ? `Файл для ${k.grade} класу, а це КТП для ${target.grade} класу.` : null
  return { classes, semesters, mismatches, error }
}
