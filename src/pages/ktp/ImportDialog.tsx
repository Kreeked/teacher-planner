import { FileUp, TriangleAlert } from 'lucide-react'
import { Dialog } from '../../components/Dialog'
import { useMemo, useState } from 'react'
import { useCollection } from '../../data/db'
import { useTimetables } from '../../data/useTimetables'
import { lessonsWord } from '../../data/ktp'
import { classWeekdays, scheduleRanges, type DateProblem } from '../../data/mismatch'
import { WEEKDAYS } from '../../data/schedule'
import type { AcademicYear, Course } from '../../data/types'
import { formatDate } from '../../data/year'
import { applyImport, type ImportSummary } from '../../import/applyImport'
import { readDocx } from '../../import/docx'
import { KtpParseError, parseKtp, type ParsedKtp } from '../../import/ktpParser'
import { plural } from '../../lib/plural'
import { planImport, semesterOf, type ImportContext } from '../../import/plan'

type Props = {
  file: File
  year: AcademicYear
  course: Course // КТП, у яке імпортуємо: інше вибрати не можна
  onClose: () => void
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

function Preview({ ktp, file, year, course, onClose }: Props & { ktp: ParsedKtp }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<ImportSummary | null>(null)

  // Усе, з чим імпорт має звіритися: КТП (теми, уроки, дати), семестри, розклад і дні без уроків.
  const byYear = { field: 'academic_year_id', value: year.id }
  const byCourse = { field: 'course_id', value: course.id }
  const { items: yearClasses, loading: l0 } = useCollection('class_groups', byYear)
  const { items: periods, loading: l1 } = useCollection('periods', byYear)
  const { items: daysOff, loading: l2 } = useCollection('days_off', byYear)
  const { items: timetables, loading: l3 } = useTimetables(byYear)
  const { items: allEntries, loading: l4 } = useCollection('timetable_entries')
  const { items: links, loading: l5 } = useCollection('course_classes', byCourse)
  const { items: topics, loading: l6 } = useCollection('topics', byCourse)
  const { items: lessonDocs, loading: l7 } = useCollection('lessons', byCourse)
  const { items: schedules, loading: l8 } = useCollection('lesson_schedules', byCourse)
  const loading = l0 || l1 || l2 || l3 || l4 || l5 || l6 || l7 || l8

  const ctx = useMemo<ImportContext>(
    () => ({
      classes: yearClasses,
      periods,
      links,
      topics,
      lessons: lessonDocs,
      schedules,
      daysOff,
      ranges: scheduleRanges(periods, year),
      timetables,
      entries: allEntries.filter((e) => timetables.some((t) => t.id === e.timetable_id)),
    }),
    [yearClasses, periods, year, links, topics, lessonDocs, schedules, daysOff, timetables, allEntries],
  )
  const plan = useMemo(() => planImport(ktp, course, ctx), [ktp, course, ctx])

  const lessons = ktp.topics.flatMap((t) => t.lessons)
  const extra = lessons.filter((l) => l.number === null).length
  const topicsWithLessons = ktp.topics.filter((t) => t.lessons.length)
  const emptyTopics = ktp.topics.length - topicsWithLessons.length
  const used = plan.classes.filter((c) => c.classId && c.linked)
  const skipped = plan.classes.filter((c) => !c.linked)
  const dates = lessons.reduce((n, l) => n + l.dates.filter((d, i) => d && plan.classes[i]?.linked && plan.classes[i].classId).length, 0)
  const missingSemesters = plan.semesters.filter((s) => !s.exists)
  const differing = plan.semesters.filter((s) => s.differs)
  const mismatches = plan.mismatches.filter((m) => m.bad > 0)

  async function run() {
    setBusy(true)
    setError('')
    try {
      setResult(await applyImport(ktp, course, ctx, plan))
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
        onClose={onClose}
        footer={
          <button className="btn" onClick={onClose}>
            Закрити
          </button>
        }
      >
        <div className="import-notes">
          <span>
            Додано {result.lessons} {lessonsWord(result.lessons)}, {result.topics} {topicsWord(result.topics)}.
          </span>
          {result.updated > 0 && <span>Оновлено з файлу {result.updated} {lessonsWord(result.updated)}, що вже були в КТП.</span>}
          <span>Записано {result.dates} {datesWord(result.dates)}.</span>
          {skipped.length > 0 && <span>Колонки без КТП пропущено: {skipped.map((c) => c.display).join(', ')}.</span>}
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
          <button className="btn" onClick={run} disabled={busy || loading || !!plan.error}>
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

      {(ktp.warnings.length > 0 || plan.error || ktp.subject.toLowerCase() !== course.subject.toLowerCase()) && (
        <div className="warn-box">
          {plan.error && (
            <p className="warn">
              <TriangleAlert size={14} /> {plan.error}
            </p>
          )}
          {!plan.error && ktp.subject.toLowerCase() !== course.subject.toLowerCase() && (
            <p className="warn">
              <TriangleAlert size={14} /> У файлі предмет «{ktp.subject}», а це КТП «{course.subject}».
            </p>
          )}
          {ktp.warnings.map((w) => (
            <p key={w} className="warn">
              <TriangleAlert size={14} /> {w}
            </p>
          ))}
        </div>
      )}

      <p className="muted small-text">
        Імпорт нічого не змінює в налаштуваннях року. Теми й уроки, що вже є в КТП (за назвою), переписуються даними з файлу:
        тип, ДЗ, семестр і дати. Порожня дата з файлу наявну не стирає, уроки, яких немає у файлі, лишаються.
      </p>

      {(skipped.length > 0 || missingSemesters.length > 0 || differing.length > 0) && (
        <section className="import-sec">
          <h3 className="sec-label">Що не збігається з налаштуваннями року</h3>
          {skipped.map((c) => (
            <p key={c.index} className="warn">
              <TriangleAlert size={14} />
              <span>
                {c.display}: {c.classId ? 'клас не прив’язано до цього КТП' : 'такого класу немає в році'}, дати цієї колонки не
                імпортуються. Це змінюється в налаштуваннях року.
              </span>
            </p>
          ))}
          {missingSemesters.map((s) => (
            <p key={s.number} className="warn">
              <TriangleAlert size={14} />
              <span>{s.number === 1 ? 'І' : 'ІІ'} семестру немає в році: його уроки імпортуються без семестру.</span>
            </p>
          ))}
          {differing.map((s) => {
            const f = ktp.semesters.find((x) => x.number === s.number)
            const y = periods.find((p) => !p.parent_id && semesterOf(p) === s.number)
            return (
              <p key={s.number} className="warn">
                <TriangleAlert size={14} />
                <span>
                  {s.number === 1 ? 'І' : 'ІІ'} семестр: у файлі {f && `${formatDate(f.start)} — ${formatDate(f.end)}`}, у році{' '}
                  {y && `${formatDate(y.start_date)} — ${formatDate(y.end_date)}`}.
                </span>
              </p>
            )
          })}
        </section>
      )}

      {mismatches.length > 0 && (
        <section className="import-sec">
          <h3 className="sec-label">Дати з файлу й розклад</h3>
          {mismatches.map((m) => {
            const c = plan.classes[m.classIndex]
            const first = lessons.map((l) => l.dates[m.classIndex]).find(Boolean)
            const days = c.classId && first ? classWeekdays(ctx, c.classId, course.id, first) : []
            return (
              <p key={m.classIndex} className="warn">
                <TriangleAlert size={14} />
                <span>
                  {c.display}: {m.bad} з {m.total} {datesWord(m.total)} не збігаються з розкладом — {problemText(m.problems, days)}
                </span>
              </p>
            )
          })}
          <p className="muted small-text">Дати імпортуються як у файлі й лишаються підсвіченими в КТП. Розклад міняється на сторінці року.</p>
        </section>
      )}

      {used.length === 0 && <p className="muted small-text">Жоден клас файлу не прив’язано до цього КТП: дат не буде.</p>}
      {error && <p className="field-error">{error}</p>}
    </Dialog>
  )
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
  if (problems['out-of-range']) parts.push('поза семестрами року')
  return parts.join('; ')
}

const topicsWord = (n: number) => plural(n, 'тема', 'теми', 'тем')
const datesWord = (n: number) => plural(n, 'дата', 'дати', 'дат')
