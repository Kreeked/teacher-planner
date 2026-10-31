import { dateProblem, type DateProblem, type ScheduleData } from '../data/mismatch'
import type { AcademicYear, ClassGroup, Course, CourseClass, Lesson, LessonSchedule, Period, Topic } from '../data/types'
import { classDisplayName, validatePeriod } from '../data/year'
import { sameTitle, type ParsedKtp, type ParsedTopic } from './ktpParser'

/** Що вже є в системі: від цього залежить, що імпорт має створити, а що пропустити чи запитати. */
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
  grade: number
  letter: string
  classId: string | null // null — класу ще немає в році
  linked: boolean // клас уже прив'язаний до цільового КТП
}

export type SemesterPlan = { number: number; exists: boolean; error: string | null }

export type Conflict = {
  key: string // id дати: `${урок}_${клас}`
  classIndex: number
  label: string
  current: string
  incoming: string
}

export type Mismatch = { classIndex: number; total: number; bad: number; problems: Partial<Record<DateProblem, number>> }

export type ImportPlan = {
  classes: ClassPlan[]
  semesters: SemesterPlan[]
  conflicts: Conflict[]
  mismatches: Mismatch[]
}

export type Mode = 'keep' | 'replace' | 'each'

/** Рішення користувача на екрані перевірки. */
export type Decisions = {
  addClasses: Set<number> // колонки файлу, класи яких додати до року
  addSemesters: Set<number>
  mode: Record<number, Mode> // що робити з датами, що розходяться, у кожного класу
  picks: Set<string> // у режимі «по одній»: дати, які замінити
}

export function planImport(k: ParsedKtp, year: AcademicYear, target: Course | null, ctx: ImportContext): ImportPlan {
  const classes = k.classNames.map((name, index): ClassPlan => {
    const { grade, letter } = splitClassName(name)
    const display = classDisplayName(grade, letter)
    const found = ctx.classes.find((c) => c.display_name === display)
    return {
      index,
      display,
      grade,
      letter,
      classId: found?.id ?? null,
      linked: !!found && ctx.links.some((l) => l.class_group_id === found.id),
    }
  })

  const semesters = k.semesters.map((s): SemesterPlan => {
    const exists = ctx.periods.some((p) => !p.parent_id && semesterOf(p) === s.number)
    const error = exists ? null : validatePeriod({ parent_id: null, start_date: s.start, end_date: s.end }, year, ctx.periods)
    return { number: s.number, exists, error }
  })

  // Дати уроків, що вже є в КТП, відрізняються від дат у файлі.
  const conflicts: Conflict[] = []
  for (const pt of k.topics) {
    const topic = findTopic(ctx.topics, pt)
    if (!topic) continue
    for (const pl of pt.lessons) {
      const lesson = ctx.lessons.find((l) => l.topic_id === topic.id && sameTitle(l.title, pl.title))
      if (!lesson) continue
      pl.dates.forEach((incoming, i) => {
        const c = classes[i]
        if (!incoming || !c?.classId) return
        const key = scheduleId(lesson.id, c.classId)
        const current = ctx.schedules.find((s) => s.id === key)?.planned_date
        if (current && current !== incoming)
          conflicts.push({
            key,
            classIndex: i,
            label: `${lesson.number ? `№${lesson.number} ` : ''}${lesson.title}`,
            current,
            incoming,
          })
      })
    }
  }

  // Дати з файлу проти розкладу. Нового КТП ще немає в розкладі, тож усі його дати «без розкладу».
  const mismatches = classes.map((c): Mismatch => {
    const m: Mismatch = { classIndex: c.index, total: 0, bad: 0, problems: {} }
    for (const pt of k.topics)
      for (const pl of pt.lessons) {
        const date = pl.dates[c.index]
        if (!date) continue
        m.total++
        const problem = c.classId ? dateProblem(date, c.classId, target?.id ?? null, ctx) : 'no-schedule'
        if (!problem) continue
        m.bad++
        m.problems[problem] = (m.problems[problem] ?? 0) + 1
      }
    return m
  })

  return { classes, semesters, conflicts, mismatches }
}

/** За замовчуванням додаємо все, чого бракує, а дати, що розходяться, лишаємо як у системі. */
export function defaultDecisions(plan: ImportPlan): Decisions {
  return {
    addClasses: new Set(plan.classes.filter((c) => !c.classId).map((c) => c.index)),
    addSemesters: new Set(plan.semesters.filter((s) => !s.exists && !s.error).map((s) => s.number)),
    mode: {},
    picks: new Set(),
  }
}

export function modeOf(d: Decisions, classIndex: number): Mode {
  return d.mode[classIndex] ?? 'keep'
}

/** Чи замінити дату з системи датою з файлу. */
export function isReplaced(c: Conflict, d: Decisions) {
  const mode = modeOf(d, c.classIndex)
  return mode === 'replace' || (mode === 'each' && d.picks.has(c.key))
}
