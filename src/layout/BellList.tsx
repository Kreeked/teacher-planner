import type { DayLesson } from '../data/day'
import { slotAt } from '../data/day'
import type { BellSchedule } from '../data/types'
import { gradeColor } from '../data/year'

type Props = {
  bell: BellSchedule
  list: DayLesson[]
  // Для сьогоднішнього дня підсвічується урок, що йде зараз.
  now: Date | null
}

/** Дзвінки лише тих уроків, що є в розкладі вибраного дня, і клас на кожному. */
export function BellList({ bell, list, now }: Props) {
  const current = now ? slotAt(bell.slots, now) : null
  const slots = bell.slots.filter((b) => list.some((x) => x.slot === b.number))
  // Урок без номера в дні: на цю дату немає чинного тижневого розкладу або в ньому немає цього класу.
  const unplaced = list.some((x) => x.slot === null)
  if (!slots.length && !unplaced) return null
  return (
    <section className="panel bells">
      <h3>Розклад дзвінків</h3>
      <div className="bell-grid num">
        {slots.map((b) => (
          <div key={b.number} className={b.number === current ? 'bell-row now' : 'bell-row'}>
            <b>{b.number}</b>
            <span className="bell-time">
              {b.start}–{b.end}
            </span>
            <span className="bell-cls">
              {list
                .filter((x) => x.slot === b.number)
                .map((x) => (
                  <span key={x.s.id} className="class-badge" style={{ background: gradeColor(x.cls.grade) }}>
                    {x.cls.display_name}
                  </span>
                ))}
            </span>
          </div>
        ))}
      </div>
      {unplaced && <p className="bell-note">Для цієї дати немає розкладу уроків, тому класи не прив'язано до дзвінків.</p>}
    </section>
  )
}
