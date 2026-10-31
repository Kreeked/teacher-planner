import { CalendarCheck, TriangleAlert } from 'lucide-react'
import { useContext, useState } from 'react'
import { Link } from 'react-router-dom'
import { Menu } from '../../components/Menu'
import { commit, newBatch, updateFields } from '../../data/db'
import type { DateIssue, DateProblem } from '../../data/mismatch'
import type { ISODate } from '../../data/types'
import { shortDate } from '../../data/year'
import { ask } from '../../lib/confirm'
import { reveal } from '../../lib/reveal'
import { DateHintsContext, dayLabel, issueText } from './dateHintsContext'

/** Пігулка дати, що не збігається з розкладом: у меню причина й перенесення на найближчий день. */
export function IssuePill({ id, className, date }: { id: string; className: string; date: ISODate }) {
  const hints = useContext(DateHintsContext)
  const issue = hints.issues.get(id)
  if (!issue) return null
  const fix = hints.fixes.get(id)
  const reason = issueText(issue, hints.weekdays(issue.classId, issue.date))
  return (
    <Menu
      label={`${className}, ${shortDate(date)}: ${reason}`}
      triggerClass="date-pill warn"
      align="start"
      trigger={
        <>
          <TriangleAlert size={13} aria-hidden />
          <span>{className}</span> <b className="num">{shortDate(date)}</b>
        </>
      }
      groups={[
        [{ label: reason, icon: TriangleAlert, onSelect: () => {} }],
        fix
          ? [
              {
                label: `Перенести на ${dayLabel(fix)} ${shortDate(fix)}`,
                icon: CalendarCheck,
                onSelect: () => updateFields('lesson_schedules', id, { planned_date: fix }),
              },
            ]
          : [],
      ]}
    />
  )
}

const KINDS: [DateProblem, string][] = [
  ['weekday', 'не той день тижня'],
  ['day-off', 'день без уроків'],
  ['overbooked', 'більше уроків, ніж у розкладі'],
  ['no-schedule', 'класу з цим КТП немає в розкладі'],
]

/** Підсумок угорі КТП: скільки дат не збігається з розкладом, показати їх по черзі й перенести всі. */
export function DateHintsBanner({ issues, fixes }: { issues: DateIssue[]; fixes: Map<string, ISODate | null> }) {
  const [shown, setShown] = useState(0)
  if (issues.length === 0) return null
  const movable = issues.filter((i) => fixes.get(i.id))
  const parts = KINDS.map(([k, text]) => [issues.filter((i) => i.problem === k).length, text] as const).filter(([n]) => n > 0)

  function show() {
    const i = shown % issues.length
    const el = document.getElementById(`lesson-${issues[i].lessonId}`)
    if (el) reveal(el)
    setShown(i + 1)
  }

  async function moveAll() {
    if (!(await ask(`Перенести ${movable.length} ${movable.length === 1 ? 'дату' : 'дат'} на найближчі дні за розкладом? Минулі дати не змінюються.`)))
      return
    const batch = newBatch()
    for (const i of movable) updateFields('lesson_schedules', i.id, { planned_date: fixes.get(i.id) as ISODate }, batch)
    commit(batch)
  }

  return (
    <div className="warn-box date-hints" role="status">
      <p className="warn">
        <TriangleAlert size={14} />
        <span>
          Дат, що не збігаються з розкладом: <b className="num">{issues.length}</b> ({parts.map(([n, t]) => `${n} — ${t}`).join('; ')}).
        </span>
      </p>
      <div className="date-hints-actions">
        <button type="button" className="btn ghost small" onClick={show}>
          Показати
        </button>
        {movable.length > 0 && (
          <button type="button" className="btn ghost small" onClick={moveAll}>
            Перенести {movable.length} на найближчі дні
          </button>
        )}
        <Link to="/ktp/year" className="btn ghost small">
          Розклад
        </Link>
      </div>
    </div>
  )
}
