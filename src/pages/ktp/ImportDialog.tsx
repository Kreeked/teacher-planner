import { FileUp, TriangleAlert, X } from 'lucide-react'
import { useState } from 'react'
import { courseTitle, lessonsWord } from '../../data/ktp'
import type { AcademicYear, ClassGroup, Course } from '../../data/types'
import { formatDate } from '../../data/year'
import { applyImport } from '../../import/applyImport'
import { readDocx } from '../../import/docx'
import { KtpParseError, parseKtp, type ParsedKtp } from '../../import/ktpParser'

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
          message: e instanceof KtpParseError ? e.message : 'Не вдалося прочитати файл. Це точно документ Word (.docx)?',
        })
      })
  }

  return (
    <div className="overlay" onClick={props.onClose}>
      <div className="dialog" role="dialog" aria-label="Імпорт КТП" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-head">
          <div className="grow">
            <b>Імпорт КТП з Word</b>
            <span>{props.file.name}</span>
          </div>
          <button className="icon-btn" onClick={props.onClose} aria-label="Закрити">
            <X size={16} />
          </button>
        </div>
        {state.status === 'reading' && <p className="muted">Читаю файл…</p>}
        {state.status === 'error' && <p className="field-error">{state.message}</p>}
        {state.status === 'ready' && <Preview {...props} ktp={state.ktp} />}
      </div>
    </div>
  )
}

function Preview({ ktp, year, courses, classes, onDone }: Props & { ktp: ParsedKtp }) {
  const candidates = courses.filter((c) => c.grade === ktp.grade)
  const [targetId, setTargetId] = useState(
    candidates.find((c) => c.subject.toLowerCase() === ktp.subject.toLowerCase())?.id ?? '',
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const lessons = ktp.topics.flatMap((t) => t.lessons)
  const extra = lessons.filter((l) => l.number === null).length
  const outcomes = new Set(lessons.flatMap((l) => l.outcomes)).size
  const dates = lessons.reduce((n, l) => n + l.dates.filter(Boolean).length, 0)
  const existing = new Set(classes.map((c) => c.display_name.toUpperCase()))
  const missing = ktp.classNames.filter((n) => !existing.has(n.toUpperCase()))
  const topicsWithLessons = ktp.topics.filter((t) => t.lessons.length)
  const emptyTopics = ktp.topics.length - topicsWithLessons.length

  async function run() {
    setBusy(true)
    setError('')
    try {
      const sum = await applyImport(ktp, year, courses.find((c) => c.id === targetId) ?? null)
      onDone(sum.courseId)
    } catch (e) {
      console.error(e)
      setError('Не вдалося зберегти. Спробуй ще раз.')
      setBusy(false)
    }
  }

  return (
    <>
      <div className="import-summary">
        <b>
          {ktp.subject}, {ktp.grade} клас
        </b>
        <span>Класи: {ktp.classNames.join(', ')}</span>
        {ktp.semesters.map((s) => (
          <span key={s.number}>
            {s.number === 1 ? 'І' : 'ІІ'} семестр: {formatDate(s.start)} — {formatDate(s.end)}
          </span>
        ))}
        <span>
          Тем з уроками: {topicsWithLessons.length}
          {emptyTopics > 0 && ` (і ще ${emptyTopics} з таблиці годин, поки без уроків)`}
        </span>
        <span>
          Уроків: {lessons.length - extra}
          {extra > 0 && ` + ${extra} додатковий «*» лише для частини класів`}
        </span>
        <span>
          ОРН: {outcomes} · дат по класах: {dates}
          {ktp.yearTotal && ` · годин за рік: ${ktp.yearTotal}`}
        </span>
        {missing.length > 0 && <span>Буде створено класи: {missing.join(', ')}</span>}
      </div>

      {ktp.warnings.map((w) => (
        <p key={w} className="warn">
          <TriangleAlert size={14} /> {w}
        </p>
      ))}

      <label className="form-label">
        Куди імпортувати
        <select className="field" value={targetId} onChange={(e) => setTargetId(e.target.value)}>
          <option value="">Нове КТП ({year.title})</option>
          {candidates.map((c) => (
            <option key={c.id} value={c.id}>
              Дописати в «{courseTitle(c)}»
            </option>
          ))}
        </select>
      </label>
      {targetId && (
        <p className="muted">
          Теми з такими самими назвами об'єднаються, а уроки, що вже є в темі, пропустяться. Так можна імпортувати ІІ
          семестр у те саме КТП.
        </p>
      )}
      {error && <p className="field-error">{error}</p>}
      <button className="btn" onClick={run} disabled={busy}>
        <FileUp size={16} /> {busy ? 'Імпортую…' : `Імпортувати ${lessons.length} ${lessonsWord(lessons.length)}`}
      </button>
    </>
  )
}
