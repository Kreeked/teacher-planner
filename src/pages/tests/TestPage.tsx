import { ArrowLeft, Download, FileUp, Plus, Trash2, TriangleAlert, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { InlineText } from '../../components/InlineText'
import { DragHandle, SortableList } from '../../components/Sortable'
import { useSortableItem } from '../../lib/drag'
import { updateFields, useCollection } from '../../data/db'
import {
  MAX_OPTIONS,
  QUESTION_TIMES,
  QUESTION_TYPES,
  checkTest,
  newQuestion,
  questionsWord,
  typeInfo,
} from '../../data/tests'
import type { Question, QuestionType, Test } from '../../data/types'
import { exportTest, importTestFile } from '../../lib/testFiles'
import { TargetSelect } from './TargetSelect'

/** Редактор тесту: прив'язка до уроку чи теми, питання, експорт для Wayground. */
export function TestPage() {
  const { testId = '' } = useParams()
  const { items: all, loading } = useCollection('tests')
  const test = all.find((t) => t.id === testId)
  const byCourse = test ? { field: 'course_id', value: test.course_id } : null
  const { items: topics } = useCollection('topics', byCourse)
  const { items: lessons } = useCollection('lessons', byCourse)
  const fileInput = useRef<HTMLInputElement>(null)
  const [error, setError] = useState('')
  // Останній записаний список: кілька правок поспіль (поле за полем) не мають затирати одна одну,
  // поки Firestore ще не повернув попередню.
  const [pending, setPending] = useState<{ from: Question[]; value: Question[] } | null>(null)

  if (!test) return <div className="page">{!loading && <p className="muted">Тест не знайдено.</p>}</div>

  const questions = pending?.from === test.questions ? pending.value : test.questions
  const issues = checkTest(questions)
  const blocking = issues.filter((i) => i.blocking)

  function save(next: Question[]) {
    setPending({ from: test!.questions, value: next })
    updateFields('tests', test!.id, { questions: next })
  }

  function patch(i: number, p: Partial<Question>) {
    save(questions.map((q, j) => (j === i ? { ...q, ...p } : q)))
  }

  async function append(f: File | undefined) {
    if (!f) return
    setError('')
    try {
      const t = await importTestFile(f)
      save([...questions, ...t.questions])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не вдалося прочитати файл.')
    }
  }

  function download(t: Test) {
    if (
      blocking.length &&
      !confirm(`У тесті є помилки (${blocking.length}), Wayground може не прийняти файл. Все одно зберегти?`)
    )
      return
    exportTest(t)
  }

  return (
    <div className="page">
      <main className="main test-page">
        <Link to={`/ktp/${test.course_id}/tests`} className="back">
          <ArrowLeft size={14} /> Тести
        </Link>
        <div className="sec-head">
          <h1 className="grow">
            <InlineText
              value={test.title}
              label="Назва тесту"
              className="title-input"
              onSave={(v) => updateFields('tests', test.id, { title: v || 'Тест' })}
            />
          </h1>
          <button className="btn small" disabled={!questions.length} onClick={() => download(test)}>
            <Download size={14} /> Для Wayground
          </button>
        </div>

        <div className="test-meta">
          <label className="grow">
            <span className="form-label">Прив’язати до</span>
            <TargetSelect
              value={test}
              topics={topics}
              lessons={lessons}
              onChange={(t) => updateFields('tests', test.id, t)}
            />
          </label>
          <span className="chip plain">
            {questions.length} {questionsWord(questions.length)}
          </span>
        </div>

        {issues.length > 0 && (
          <details className="test-issues">
            <summary>
              <TriangleAlert size={14} /> {blocking.length ? `Помилок: ${blocking.length}` : 'Помилок немає'}
              {issues.length > blocking.length && `, порад: ${issues.length - blocking.length}`}
            </summary>
            <ul>
              {issues.map((x, i) => (
                <li key={i} className={x.blocking ? 'bad' : ''}>
                  {x.question ? `Питання ${x.question}: ` : ''}
                  {x.text}
                </li>
              ))}
            </ul>
          </details>
        )}

        <ol className="questions">
          {/* Питання не мають власних id, тож перетягуємо їхні номери. */}
          <SortableList
            items={questions.map((_, i) => i)}
            getId={(i) => `q${i}`}
            onReorder={(order) => save(order.map((i) => questions[i]))}
          >
            {(i) => (
              <QuestionCard
                key={i}
                n={i + 1}
                q={questions[i]}
                onChange={(p) => patch(i, p)}
                onRemove={() => {
                  if (!questions[i].text || confirm(`Видалити питання ${i + 1}?`))
                    save(questions.filter((_, j) => j !== i))
                }}
              />
            )}
          </SortableList>
        </ol>

        <div className="row-actions">
          <button className="btn ghost" onClick={() => save([...questions, newQuestion()])}>
            <Plus size={16} /> Питання
          </button>
          <button className="btn ghost" onClick={() => fileInput.current?.click()}>
            <FileUp size={16} /> Додати питання з Excel
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            hidden
            onChange={(e) => (append(e.target.files?.[0]), (e.target.value = ''))}
          />
        </div>
        {error && <p className="field-error">{error}</p>}
      </main>
    </div>
  )
}

type CardProps = {
  n: number
  q: Question
  onChange: (p: Partial<Question>) => void
  onRemove: () => void
}

function QuestionCard({ n, q, onChange, onRemove }: CardProps) {
  const { ref, style, handle } = useSortableItem(`q${n - 1}`)
  const info = typeInfo(q.type)
  const multi = q.type === 'Checkbox'

  function setType(type: QuestionType) {
    const next = typeInfo(type)
    const options = next.options && q.options.length < 2 ? [...q.options, '', ''].slice(0, 4) : q.options
    const correct = !next.correct ? [] : type === 'Multiple Choice' ? q.correct.slice(0, 1) : q.correct
    onChange({ type, options, correct: next.correct && !correct.length ? [1] : correct })
  }

  function toggle(k: number) {
    if (!multi) return onChange({ correct: [k] })
    const has = q.correct.includes(k)
    onChange({ correct: has ? q.correct.filter((c) => c !== k) : [...q.correct, k].sort() })
  }

  function removeOption(j: number) {
    const k = j + 1
    onChange({
      options: q.options.filter((_, x) => x !== j),
      correct: q.correct.filter((c) => c !== k).map((c) => (c > k ? c - 1 : c)),
    })
  }

  return (
    <li ref={ref} style={style} className="question">
      <div className="question-head">
        <DragHandle label={`Перемістити питання ${n}`} {...handle} />
        <b>{n}</b>
        <select
          className="field"
          aria-label={`Тип питання ${n}`}
          value={q.type}
          onChange={(e) => setType(e.target.value as QuestionType)}
        >
          {QUESTION_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <select
          className="field"
          aria-label={`Час на питання ${n}`}
          value={q.time}
          onChange={(e) => onChange({ time: Number(e.target.value) })}
        >
          {QUESTION_TIMES.map((t) => (
            <option key={t} value={t}>
              {t < 60 ? `${t} с` : `${t / 60} хв`}
            </option>
          ))}
        </select>
        <span className="grow" />
        <button className="icon-btn del" onClick={onRemove} aria-label={`Видалити питання ${n}`}>
          <Trash2 size={15} />
        </button>
      </div>

      <InlineText
        value={q.text}
        label={`Текст питання ${n}`}
        placeholder="Текст питання"
        className="q-text"
        multiline
        onSave={(text) => onChange({ text })}
      />

      {info.options && (
        <div className="options">
          {q.options.map((o, j) => {
            const k = j + 1
            const right = q.correct.includes(k)
            return (
              <div key={j} className={right ? 'option right' : 'option'}>
                {info.correct && (
                  <input
                    type={multi ? 'checkbox' : 'radio'}
                    name={`correct-${n}`}
                    checked={right}
                    onChange={() => toggle(k)}
                    aria-label={`Варіант ${k} правильний`}
                  />
                )}
                <InlineText
                  value={o}
                  label={`Варіант ${k} питання ${n}`}
                  placeholder={q.type === 'Fill-in-the-Blank' ? `Правильна відповідь ${k}` : `Варіант ${k}`}
                  onSave={(v) => onChange({ options: q.options.map((x, y) => (y === j ? v : x)) })}
                />
                <button className="icon-btn" onClick={() => removeOption(j)} aria-label={`Прибрати варіант ${k}`}>
                  <X size={14} />
                </button>
              </div>
            )
          })}
          {q.options.length < MAX_OPTIONS && (
            <button className="link-btn" onClick={() => onChange({ options: [...q.options, ''] })}>
              + варіант
            </button>
          )}
        </div>
      )}

      <InlineText
        value={q.explanation}
        label={`Пояснення до питання ${n}`}
        placeholder="Пояснення після відповіді (необов’язково)"
        className="q-expl"
        multiline
        onSave={(explanation) => onChange({ explanation })}
      />
    </li>
  )
}
