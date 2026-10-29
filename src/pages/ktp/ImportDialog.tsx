import { FileUp, TriangleAlert } from 'lucide-react'
import { Dialog } from '../../components/Dialog'
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

  const lessons = ktp.topics.flatMap((t) => t.lessons)
  const extra = lessons.filter((l) => l.number === null).length
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
    <Dialog
      title="Імпорт КТП з Word"
      subtitle={file.name}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Скасувати
          </button>
          <button className="btn" onClick={run} disabled={busy}>
            <FileUp size={15} /> {busy ? 'Імпортую…' : `Імпортувати ${lessons.length} ${lessonsWord(lessons.length)}`}
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
        {missing.length > 0 && <span>Буде створено класи: {missing.join(', ')}</span>}
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
          <option value="">Нове КТП ({year.title})</option>
          {candidates.map((c) => (
            <option key={c.id} value={c.id}>
              Дописати в «{courseTitle(c)}»
            </option>
          ))}
        </select>
      </label>
      {targetId && (
        <p className="muted small-text">
          Теми з такими самими назвами об'єднаються, а уроки, що вже є в темі, пропустяться. Так можна імпортувати ІІ
          семестр у те саме КТП.
        </p>
      )}
      {error && <p className="field-error">{error}</p>}
    </Dialog>
  )
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
