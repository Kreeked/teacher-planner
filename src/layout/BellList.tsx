import { ChevronDown, ChevronUp } from 'lucide-react'
import { useState } from 'react'
import type { DayLesson } from '../data/day'
import { slotAt } from '../data/day'
import type { BellSchedule, ISODate } from '../data/types'
import { gradeColor, shortDate } from '../data/year'
import { useNarrow } from '../lib/useNarrow'

type Props = {
  day: ISODate
  bell: BellSchedule
  list: DayLesson[]
  // Для сьогоднішнього дня підсвічується урок, що йде зараз.
  now: Date | null
}

/** Розклад дзвінків і клас на кожному уроці вибраного дня. */
export function BellList({ day, bell, list, now }: Props) {
  const current = now ? slotAt(bell.slots, now) : null
  // Урок без номера в дні: на цю дату немає чинного тижневого розкладу або в ньому немає цього класу.
  // На телефоні за замовчуванням лише уроки з класами — решта дзвінків під кнопкою.
  const narrow = useNarrow()
  const [all, setAll] = useState(false)
  const fold = narrow && !all
  const slots = fold ? bell.slots.filter((b) => list.some((x) => x.slot === b.number)) : bell.slots
  const unplaced = list.some((x) => x.slot === null)
  return (
    <section className="panel bells">
      <h3>
        Розклад дзвінків <span className="cnt">{shortDate(day)}</span>
      </h3>
      <div className="bell-grid num">
        {slots.map((b) => {
          const classes = list.filter((x) => x.slot === b.number)
          return (
            <div key={b.number} className={b.number === current ? 'bell-row now' : 'bell-row'}>
              <b>{b.number}</b>
              <span className={classes.length ? 'bell-time' : 'bell-time free'}>
                {b.start}–{b.end}
              </span>
              <span className="bell-cls">
                {classes.length ? (
                  classes.map((x) => (
                    <span key={x.s.id} className="class-badge" style={{ background: gradeColor(x.cls.grade) }}>
                      {x.cls.display_name}
                    </span>
                  ))
                ) : (
                  <span className="bell-free">—</span>
                )}
              </span>
            </div>
          )
        })}
      </div>
      {narrow && (
        <button type="button" className="fold-toggle" aria-expanded={all} onClick={() => setAll(!all)}>
          {all ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          {all ? 'Лише уроки' : `Усі дзвінки (${bell.slots.length})`}
        </button>
      )}
      {unplaced && <p className="bell-note">Для цієї дати немає розкладу уроків, тому класи не прив'язано до дзвінків.</p>}
    </section>
  )
}
