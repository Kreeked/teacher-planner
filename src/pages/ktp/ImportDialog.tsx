import { FileUp, TriangleAlert } from 'lucide-react'
import { Dialog } from '../../components/Dialog'
import { useMemo, useState } from 'react'
import { useCollection } from '../../data/db'
import { courseTitle, lessonsWord } from '../../data/ktp'
import { classWeekdays, type DateProblem } from '../../data/mismatch'
import { WEEKDAYS } from '../../data/schedule'
import type { AcademicYear, ClassGroup, Course } from '../../data/types'
import { formatDate, shortDate } from '../../data/year'
import { applyImport, type ImportSummary } from '../../import/applyImport'
import { readDocx } from '../../import/docx'
import { KtpParseError, parseKtp, type ParsedKtp } from '../../import/ktpParser'
import {
  defaultDecisions,
  isReplaced,
  modeOf,
  planImport,
  type Decisions,
  type ImportContext,
  type Mode,
} from '../../import/plan'

type Props = {
  file: File
  year: AcademicYear
  courses: Course[]
  classes: ClassGroup[]
  onClose: () => void
  onDone: (courseId: string) => void
}

type State = { status: 'reading' } | { status: 'error'; message: string } | { status: 'ready'; ktp: ParsedKtp }

export function ImportDialog(props: Props) {
  const [state, setState] = useState<State>({ status: 'reading' })
  const [started, setStarted] = useState(false)
  if (!started) {
    setStarted(true)
    readDocx(props.file)
      .then((blocks) => setState({ status: 'ready', ktp: parseKtp(blocks) }))
      .catch((e) => {
        console.error(e)
        setState({
          status: 'error',
          message:
            e instanceof KtpParseError ? e.message : 'Не вдалося прочитати файл. Це точно документ Word (.docx)?',
        })
      })
  }

  if (state.status === 'ready') return <Preview {...props} ktp={state.ktp} />
  return (
    <Dialog title="Імпорт КТП з Word" subtitle={props.file.name} onClose={props.onClose}>
      {state.status === 'reading' && <p className="muted">Читаю файл…</p>}
      {state.status === 'error' && <p className="field-error">{state.message}</p>}
    </Dialog>
  )
}

function Preview({ ktp, file, year, courses, classes, onClose, onDone }: Props & { ktp: ParsedKtp }) {
  const candidates = courses.filter((c) => c.grade === ktp.grade)
  const [targetId, setTargetId] = useState(
    candidates.find((c) => c.subject.toLowerCase() === ktp.subject.toLowerCase())?.id ?? '',
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<ImportSummary | null>(null)
  const target = courses.find((c) => c.id === targetId) ?? null

  // Усе, з чим імпорт має звіритися: наявне КТП (теми, уроки, дати), семестри, розклад і дні без уроків.
  const byYear = { field: 'academic_year_id', value: year.id }
  const byCourse = target ? { field: 'course_id', value: target.id } : null
  const { items: periods, loading: l1 } = useCollection('periods', byYear)
  const { items: daysOff, loading: l2 } = useCollection('days_off', byYear)
  const { items: timetables, loading: l3 } = useCollection('timetables', byYear)
  const { items: allEntries, loading: l4 } = useCollection('timetable_entries')
  const { items: links, loading: l5 } = useCollection('course_classes', byCourse)
  const { items: topics, loading: l6 } = useCollection('topics', byCourse)
  const { items: lessonDocs, loading: l7 } = useCollection('lessons', byCourse)
  const { items: schedules, loading: l8 } = useCollection('lesson_schedules', byCourse)
  const loading = l1 || l2 || l3 || l4 || l5 || l6 || l7 || l8

  const ctx = useMemo<ImportContext>(
    () => ({
      classes,
      periods,
      links,
      topics,
      lessons: lessonDocs,
      schedules,
      daysOff,
      timetables,
      entries: allEntries.filter((e) => timetables.some((t) => t.id === e.timetable_id)),
    }),
    [classes, periods, links, topics, lessonDocs, schedules, daysOff, timetables, allEntries],
  )
  const plan = useMemo(() => planImport(ktp, year, target, ctx), [ktp, year, target, ctx])

  // Рішення з поточним планом: що додавати, мають значення за замовчуванням, поки користувач їх не змінив.
  const [edits, setEdits] = useState<Partial<Decisions> & { forTarget?: string }>({})
  const base = useMemo(() => defaultDecisions(plan), [plan])
  const fresh = edits.forTarget === targetId
  const decisions: Decisions = {
    addClasses: (fresh && edits.addClasses) || base.addClasses,
    addSemesters: (fresh && edits.addSemesters) || base.addSemesters,
    mode: (fresh && edits.mode) || base.mode,
    picks: (fresh && edits.picks) || base.picks,
  }
  const edit = (patch: Partial<Decisions>) => setEdits({ ...decisions, ...patch, forTarget: targetId })
  const toggle = (set: Set<number>, n: number) => {
    const next = new Set(set)
    if (!next.delete(n)) next.add(n)
    return next
  }

  const lessons = ktp.topics.flatMap((t) => t.lessons)
  const extra = lessons.filter((l) => l.number === null).length
  const dates = lessons.reduce((n, l) => n + l.dates.filter(Boolean).length, 0)
  const topicsWithLessons = ktp.topics.filter((t) => t.lessons.length)
  const emptyTopics = ktp.topics.length - topicsWithLessons.length
  const newClasses = plan.classes.filter((c) => !c.classId)
  const missingSemesters = plan.semesters.filter((s) => !s.exists)
  const unlinked = target ? plan.classes.filter((c) => c.classId && !c.linked) : []
  const included = (i: number) => !!plan.classes[i].classId || decisions.addClasses.has(i)
  const conflictClasses = [...new Set(plan.conflicts.map((c) => c.classIndex))].filter(included)
  const mismatches = plan.mismatches.filter((m) => m.bad > 0 && included(m.classIndex))

  async function run() {
    setBusy(true)
    setError('')
    try {
      setResult(await applyImport(ktp, year, target, ctx, plan, decisions))
    } catch (e) {
      console.error(e)
      setError('Не вдалося зберегти. Спробуй ще раз.')
    }
    setBusy(false)
  }

  if (result)
    return (
      <Dialog
        title="Імпорт завершено"
        subtitle={file.name}
        onClose={() => onDone(result.courseId)}
        footer={
          <button className="btn" onClick={() => onDone(result.courseId)}>
            Відкрити КТП
          </button>
        }
      >
        <div className="import-notes">
          <span>
            Додано {result.lessons} {lessonsWord(result.lessons)}, {result.topics} {topicsWord(result.topics)},{' '}
            {result.dates} {datesWord(result.dates)}.
          </span>
          {result.skipped > 0 && <span>Пропущено {result.skipped}: вони вже були в КТП.</span>}
          {result.classes > 0 && <span>Додано до року класів: {result.classes}.</span>}
          {result.replaced > 0 && <span>Замінено дат датами з файлу: {result.replaced}.</span>}
          {result.kept > 0 && <span>Дат, що розходилися з файлом і лишилися як були: {result.kept}.</span>}
          {mismatches.length > 0 && (
            <span>Дат, що не збігаються з розкладом: {mismatches.reduce((n, m) => n + m.bad, 0)}.</span>
          )}
        </div>
      </Dialog>
    )

  return (
    <Dialog
      title="Імпорт КТП з Word"
      subtitle={file.name}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Скасувати
          </button>
          <button className="btn" onClick={run} disabled={busy || loading}>
            <FileUp size={16} /> {busy ? 'Імпортую…' : `Імпортувати ${lessons.length} ${lessonsWord(lessons.length)}`}
          </button>
        </>
      }
    >
      <div className="import-head">
        <b>
          {ktp.subject}, {ktp.grade} клас
        </b>
        <div className="chips">
          {ktp.classNames.map((n) => (
            <span key={n} className="badge">
              {n}
            </span>
          ))}
        </div>
      </div>

      <div className="import-stats">
        <span>
          <b className="num">{topicsWithLessons.length}</b>
          {topicsWord(topicsWithLessons.length)}
        </span>
        <span>
          <b className="num">{lessons.length - extra}</b>
          {lessonsWord(lessons.length - extra)}
          {extra > 0 && <small>+ {extra} з «*»</small>}
        </span>
        <span>
          <b className="num">{dates}</b>
          {datesWord(dates)} по класах
        </span>
      </div>

      <div className="import-notes">
        {ktp.semesters.map((s) => (
          <span key={s.number}>
            {s.number === 1 ? 'І' : 'ІІ'} семестр: {formatDate(s.start)} — {formatDate(s.end)}
          </span>
        ))}
        {ktp.yearTotal && <span>Годин за рік: {ktp.yearTotal}</span>}
        {emptyTopics > 0 && <span>Ще {emptyTopics} тем з таблиці годин поки без уроків</span>}
      </div>

      {ktp.warnings.length > 0 && (
        <div className="warn-box">
          {ktp.warnings.map((w) => (
            <p key={w} className="warn">
              <TriangleAlert size={14} /> {w}
            </p>
          ))}
        </div>
      )}

      <label className="form-label">
        Куди імпортувати
        <select className="field" value={targetId} onChange={(e) => setTargetId(e.target.value)}>
          <option value="">Створити нове КТП ({courseTitle({ subject: ktp.subject, grade: ktp.grade })})</option>
          {candidates.map((c) => (
            <option key={c.id} value={c.id}>
              Дописати в «{courseTitle(c)}»
            </option>
          ))}
        </select>
      </label>
      {targetId ? (
        <p className="muted small-text">
          Теми з такими самими назвами об'єднаються, а уроки, що вже є в темі, не дублюються: їм лише додаються порожні дати.
          Так можна імпортувати ІІ семестр у те саме КТП.
        </p>
      ) : (
        <p className="muted small-text">
          Предмета «{ktp.subject}» для {ktp.grade} класу ще немає в налаштуваннях року: його буде додано разом із КТП.
        </p>
      )}

      {(newClasses.length > 0 || missingSemesters.length > 0 || unlinked.length > 0) && (
        <section className="import-sec">
          <h3 className="sec-label">Чого бракує в налаштуваннях року</h3>
          {newClasses.map((c) => (
            <label key={c.index} className="check">
              <input
                type="checkbox"
                checked={decisions.addClasses.has(c.index)}
                onChange={() => edit({ addClasses: toggle(decisions.addClasses, c.index) })}
              />
              Додати клас {c.display} до року й до цього КТП
            </label>
          ))}
          {newClasses.some((c) => !decisions.addClasses.has(c.index)) && (
            <p className="muted small-text">Дати класів без галочки з файлу не імпортуються.</p>
          )}
          {missingSemesters.map((s) =>
            s.error ? (
              <p key={s.number} className="warn">
                <TriangleAlert size={14} /> {s.number === 1 ? 'І' : 'ІІ'} семестр не додасться: {s.error.toLowerCase()}
              </p>
            ) : (
              <label key={s.number} className="check">
                <input
                  type="checkbox"
                  checked={decisions.addSemesters.has(s.number)}
                  onChange={() => edit({ addSemesters: toggle(decisions.addSemesters, s.number) })}
                />
                Додати {s.number === 1 ? 'І' : 'ІІ'} семестр ({shortRange(ktp, s.number)})
              </label>
            ),
          )}
          {unlinked.length > 0 && (
            <p className="muted small-text">До цього КТП буде прив'язано: {unlinked.map((c) => c.display).join(', ')}.</p>
          )}
        </section>
      )}

      {conflictClasses.length > 0 && (
        <section className="import-sec">
          <h3 className="sec-label">Дати, що розходяться з тими, що вже є в системі</h3>
          {conflictClasses.map((i) => {
            const own = plan.conflicts.filter((c) => c.classIndex === i)
            const mode = modeOf(decisions, i)
            return (
              <div key={i} className="import-conflict">
                <div className="import-conflict-head">
                  <b>{plan.classes[i].display}</b>
                  <span className="muted small-text">{own.length} {datesWord(own.length)}</span>
                  <select
                    className="field"
                    aria-label={`Дати ${plan.classes[i].display}`}
                    value={mode}
                    onChange={(e) => edit({ mode: { ...decisions.mode, [i]: e.target.value as Mode } })}
                  >
                    <option value="keep">Залишити як у системі</option>
                    <option value="replace">Замінити датами з файлу</option>
                    <option value="each">Вирішити по одній</option>
                  </select>
                </div>
                {mode === 'each' &&
                  own.map((c) => (
                    <label key={c.key} className="check import-pick">
                      <input
                        type="checkbox"
                        checked={isReplaced(c, decisions)}
                        onChange={() => {
                          const picks = new Set(decisions.picks)
                          if (!picks.delete(c.key)) picks.add(c.key)
                          edit({ picks })
                        }}
                      />
                      <span>
                        {c.label}
                        <small>
                          у системі {shortDate(c.current)}, у файлі {shortDate(c.incoming)} — взяти з файлу
                        </small>
                      </span>
                    </label>
                  ))}
              </div>
            )
          })}
        </section>
      )}

      {mismatches.length > 0 && (
        <section className="import-sec">
          <h3 className="sec-label">Дати з файлу й розклад</h3>
          {mismatches.map((m) => {
            const c = plan.classes[m.classIndex]
            const first = ktp.topics.flatMap((t) => t.lessons).map((l) => l.dates[m.classIndex]).find(Boolean)
            const days = c.classId && target && first ? classWeekdays(ctx, c.classId, target.id, first) : []
            return (
              <p key={m.classIndex} className="warn">
                <TriangleAlert size={14} />
                <span>
                  {c.display}: {m.bad} з {m.total} {datesWord(m.total)} не збігаються з розкладом — {problemText(m.problems, days)}
                </span>
              </p>
            )
          })}
          <p className="muted small-text">Імпорт дат не змінює. Розбіжності лишаться підказкою, а розклад можна виправити на сторінці року.</p>
        </section>
      )}

      {error && <p className="field-error">{error}</p>}
    </Dialog>
  )
}

function shortRange(k: ParsedKtp, number: number) {
  const s = k.semesters.find((x) => x.number === number)
  return s ? `${formatDate(s.start)} — ${formatDate(s.end)}` : ''
}

function problemText(problems: Partial<Record<DateProblem, number>>, days: number[]) {
  const parts: string[] = []
  if (problems['no-schedule']) parts.push('цього класу з цим КТП немає в розкладі')
  if (problems.weekday)
    parts.push(
      days.length
        ? `у розкладі лише ${days.map((d) => WEEKDAYS.find((w) => w.value === d)?.label).join(', ')}`
        : 'не той день тижня',
    )
  if (problems['day-off']) parts.push('припадають на дні без уроків')
  return parts.join('; ')
}

function plural(n: number, one: string, few: string, many: string) {
  const d = n % 10
  const h = n % 100
  if (d === 1 && h !== 11) return one
  if (d >= 2 && d <= 4 && (h < 12 || h > 14)) return few
  return many
}

const topicsWord = (n: number) => plural(n, 'тема', 'теми', 'тем')
const datesWord = (n: number) => plural(n, 'дата', 'дати', 'дат')
