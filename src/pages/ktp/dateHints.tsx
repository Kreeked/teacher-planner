import { TriangleAlert } from 'lucide-react'
import { useContext, useState } from 'react'
import { Link } from 'react-router-dom'
import { Menu } from '../../components/Menu'
import type { DateIssue, DateProblem } from '../../data/mismatch'
import type { ISODate } from '../../data/types'
import { shortDate } from '../../data/year'
import { reveal } from '../../lib/reveal'
import { DateHintsContext, issueText } from './dateHintsContext'

/** Пігулка дати, що не збігається з розкладом: у меню причина. Дату не змінює: це рішення вчителя. */
export function IssuePill({ id, className, date }: { id: string; className: string; date: ISODate }) {
  const hints = useContext(DateHintsContext)
  const issue = hints.issues.get(id)
  if (!issue) return null
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
      groups={[[{ label: reason, icon: TriangleAlert, onSelect: () => {} }]]}
    />
  )
}

const KINDS: [DateProblem, string][] = [
  ['weekday', 'не той день тижня'],
  ['day-off', 'день без уроків'],
  ['out-of-range', 'поза семестром'],
  ['overbooked', 'більше уроків, ніж у розкладі'],
  ['no-schedule', 'класу з цим КТП немає в розкладі'],
]

/** Підсумок угорі КТП: скільки дат не збігається з розкладом і показати їх по черзі. */
export function DateHintsBanner({ issues }: { issues: DateIssue[] }) {
  const [shown, setShown] = useState(0)
  if (issues.length === 0) return null
  const parts = KINDS.map(([k, text]) => [issues.filter((i) => i.problem === k).length, text] as const).filter(([n]) => n > 0)

  function show() {
    const i = shown % issues.length
    const el = document.getElementById(`lesson-${issues[i].lessonId}`)
    if (el) reveal(el)
    setShown(i + 1)
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
        <Link to="/ktp/year" className="btn ghost small">
          Розклад
        </Link>
      </div>
    </div>
  )
}
