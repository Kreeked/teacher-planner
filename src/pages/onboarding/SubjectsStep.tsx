import { ChevronDown, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { createDoc, deleteRefs, ref, refsWhereCached, removeDoc, updateFields } from '../../data/db'
import { hoursMismatch, parseHours, semesterWeeks, subjectIssue, type SubjectDraft } from '../../data/subjects'
import type { AcademicYear, ClassGroup, Course, CourseClass, DayOff, Period } from '../../data/types'
import { gradeColor } from '../../data/year'
import { ask } from '../../lib/confirm'

/** Картка предмета: поля як текст, щоб можна було лишити їх порожніми; `linked` — класи → документи зв'язків. */
type Card = SubjectDraft & { key: number; courseId: string | null; linked: Record<string, string> }

let seq = 0

type Props = {
  year: AcademicYear
  courses: Course[]
  classes: ClassGroup[]
  links: CourseClass[]
  periods: Period[]
  daysOff: DayOff[]
  /** Чи всі картки заповнені й готові до збереження: від цього залежить «Далі». */
  onValid: (valid: boolean) => void
}

const byLetter = (a: ClassGroup, b: ClassGroup) => a.letter.localeCompare(b.letter, 'uk')

const allValid = (cards: Card[]) => cards.length > 0 && cards.every((c) => !subjectIssue(c, cards.filter((o) => o !== c)))

/** Предмети року: картка на предмет і клас-паралель, годин на тиждень у кожному семестрі й за рік, літери. */
export function SubjectsStep({ year, courses, classes, links, periods, daysOff, onValid }: Props) {
  const [cards, setCards] = useState<Card[]>(() =>
    [...courses]
      .sort((a, b) => a.grade - b.grade || a.subject.localeCompare(b.subject, 'uk'))
      .map((c) => {
        const own = links.filter((l) => l.course_id === c.id)
        return {
          key: ++seq,
          courseId: c.id,
          subject: c.subject,
          grade: c.grade,
          h1: String(c.hours_per_week),
          h2: String(c.hours_per_week_2 ?? c.hours_per_week),
          year: String(c.total_hours),
          classIds: own.map((l) => l.class_group_id),
          linked: Object.fromEntries(own.map((l) => [l.class_group_id, l.id])),
        }
      }),
  )
  const grades = [...new Set(classes.map((c) => c.grade))].sort((a, b) => a - b)
  const weeks = semesterWeeks(periods, daysOff)

  /** Заповнену картку записуємо в КТП; недописану лишаємо тільки на екрані. */
  function persist(card: Card, all: Card[]): Card {
    if (subjectIssue(card, all.filter((o) => o.key !== card.key))) return card
    const fields = {
      subject: card.subject.trim(),
      grade: card.grade!,
      hours_per_week: parseHours(card.h1)!,
      hours_per_week_2: parseHours(card.h2)!,
      total_hours: parseHours(card.year)!,
    }
    const courseId = card.courseId ?? createDoc('courses', { academic_year_id: year.id, ...fields, program_ref: '', status: 'draft' })
    if (card.courseId) updateFields('courses', courseId, fields)
    const own = classes.filter((c) => c.grade === card.grade).sort(byLetter)
    const linked = { ...card.linked }
    for (const id of card.classIds)
      if (!linked[id]) linked[id] = createDoc('course_classes', { course_id: courseId, class_group_id: id, position: own.findIndex((c) => c.id === id) })
    for (const [id, linkId] of Object.entries(linked))
      if (!card.classIds.includes(id)) {
        removeDoc('course_classes', linkId)
        delete linked[id]
      }
    return { ...card, courseId, linked }
  }

  function change(key: number, patch: Partial<Card>) {
    const edited = cards.map((c) => (c.key === key ? { ...c, ...patch } : c))
    const next = edited.map((c) => (c.key === key ? persist(c, edited) : c))
    setCards(next)
    onValid(allValid(next))
  }

  function pickGrade(key: number, value: string) {
    const grade = value ? Number(value) : null
    // Нова паралель — усі її літери, зайві знімаються.
    change(key, { grade, classIds: classes.filter((c) => c.grade === grade).map((c) => c.id) })
  }

  function toggle(card: Card, id: string) {
    change(card.key, { classIds: card.classIds.includes(id) ? card.classIds.filter((x) => x !== id) : [...card.classIds, id] })
  }

  function add() {
    const next = [...cards, { key: ++seq, courseId: null, subject: '', grade: null, h1: '', h2: '', year: '', classIds: [], linked: {} }]
    setCards(next)
    onValid(false)
  }

  async function remove(card: Card) {
    if (card.courseId) {
      // Разом із предметом зникають його КТП, дати уроків і клітинки розкладу.
      const names = ['topics', 'lessons', 'lesson_schedules', 'lesson_materials', 'timetable_entries'] as const
      const rest = (await Promise.all(names.map((n) => refsWhereCached(n, 'course_id', card.courseId!)))).flat()
      if (rest.length && !(await ask(`Видалити предмет «${card.subject}» разом з його КТП і клітинками розкладу?`))) return
      const own = await refsWhereCached('course_classes', 'course_id', card.courseId)
      deleteRefs([ref('courses', card.courseId), ...own, ...rest])
    }
    const next = cards.filter((c) => c.key !== card.key)
    setCards(next)
    onValid(allValid(next))
  }

  return (
    <>
      {cards.map((card) => {
        const others = cards.filter((o) => o !== card)
        const taken = subjectIssue(card, others) === 'taken'
        const zero = subjectIssue(card, others) === 'zero'
        const mismatch = hoursMismatch(card, weeks)
        const own = classes.filter((c) => c.grade === card.grade).sort(byLetter)
        const color = card.grade === null ? undefined : gradeColor(card.grade)
        const hours = (field: 'h1' | 'h2' | 'year', label: string, max: number) => (
          <label className="ob-sub-f">
            {label}
            <input
              className="ob-sub-in num"
              inputMode="numeric"
              placeholder="0"
              maxLength={max}
              value={card[field]}
              onChange={(e) => change(card.key, { [field]: e.target.value.replace(/\D/g, '').slice(0, max) })}
            />
          </label>
        )
        return (
          <div key={card.key} className="ob-sub">
            <div className="ob-sub-top">
              <label className="ob-sub-f grow">
                Назва
                <input
                  className="ob-sub-in"
                  placeholder="Наприклад, Інформатика"
                  value={card.subject}
                  onChange={(e) => change(card.key, { subject: e.target.value })}
                />
              </label>
              <label className="ob-sub-f grade">
                Клас
                <span className={card.grade === null ? 'ob-sub-sel' : 'ob-sub-sel on'}>
                  {color && <i style={{ background: color }} />}
                  <select value={card.grade ?? ''} aria-label="Клас" onChange={(e) => pickGrade(card.key, e.target.value)}>
                    <option value="" disabled>
                      Оберіть клас
                    </option>
                    {[...new Set([...grades, ...(card.grade === null ? [] : [card.grade])])]
                      .sort((a, b) => a - b)
                      .map((g) => (
                        <option key={g} value={g}>
                          {g} клас
                        </option>
                      ))}
                  </select>
                  <ChevronDown size={14} strokeWidth={2} aria-hidden />
                </span>
              </label>
              <button type="button" className="ob-sub-del" aria-label="Видалити предмет" onClick={() => remove(card)}>
                <Trash2 size={16} strokeWidth={1.8} aria-hidden />
              </button>
            </div>

            <div className="ob-sub-hours">
              {hours('h1', 'І семестр, год/тиж', 2)}
              {hours('h2', 'ІІ семестр, год/тиж', 2)}
              {hours('year', 'Годин за рік', 3)}
            </div>

            <div className="ob-sub-classes" role="group" aria-label="Класи">
              <span className="ob-sub-cap">Класи</span>
              {card.grade === null && <span className="ob-sub-hint">Обери клас, і з’являться його літери</span>}
              {own.map((c) => {
                const on = card.classIds.includes(c.id)
                return (
                  <button
                    key={c.id}
                    type="button"
                    className={on ? 'ob-sub-chip on' : 'ob-sub-chip'}
                    style={on ? { background: color } : undefined}
                    aria-pressed={on}
                    onClick={() => toggle(card, c.id)}
                  >
                    {c.display_name}
                  </button>
                )
              })}
            </div>

            {taken && <p className="field-error ob-sub-err">Такий предмет для цього класу вже є</p>}
            {zero && <p className="field-error ob-sub-err">Вкажи, скільки годин за рік</p>}
            {mismatch && <p className="field-error ob-sub-err">{mismatch}</p>}
          </div>
        )
      })}

      <button type="button" className="ob-sub-add" onClick={add}>
        <Plus size={16} strokeWidth={2.2} aria-hidden /> Додати предмет
      </button>
    </>
  )
}
