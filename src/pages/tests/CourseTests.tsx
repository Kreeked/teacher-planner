import { ask } from '../../lib/confirm'
import { ArrowLeft, Download, FileUp, Plus, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { createDoc, removeDoc, useCollection } from '../../data/db'
import { courseTitle } from '../../data/ktp'
import { questionsWord, targetLabel } from '../../data/tests'
import type { Test } from '../../data/types'
import { exportTest, importTestFile } from '../../lib/testFiles'

/** Тести курсу: список, імпорт з Excel, новий тест. */
export function CourseTests() {
  const { courseId = '' } = useParams()
  const navigate = useNavigate()
  const byCourse = { field: 'course_id', value: courseId }
  const { items: courses, loading } = useCollection('courses')
  const { items: tests } = useCollection('tests', byCourse)
  const { items: topics } = useCollection('topics', byCourse)
  const { items: lessons } = useCollection('lessons', byCourse)
  const fileInput = useRef<HTMLInputElement>(null)
  const [error, setError] = useState('')
  const course = courses.find((c) => c.id === courseId)

  if (!course) return <div className="page">{!loading && <p className="muted">КТП не знайдено.</p>}</div>

  // Порядок як у КТП: за темою, далі за уроком; без прив'язки — наприкінці.
  const order = (t: Test) => {
    const lesson = lessons.find((l) => l.id === t.lesson_id)
    const topic = topics.find((x) => x.id === (lesson?.topic_id ?? t.topic_id))
    return topic ? topic.position * 10000 + (lesson ? lesson.position + 1 : 0) : Infinity
  }
  const sorted = [...tests].sort((a, b) => order(a) - order(b) || a.title.localeCompare(b.title))

  function create(title: string, questions: Test['questions']) {
    return createDoc('tests', { course_id: courseId, topic_id: null, lesson_id: null, title, questions })
  }

  async function importFiles(input: FileList | null) {
    // Копія: список файлів поля очищується одразу після вибору.
    const files = [...(input ?? [])]
    if (!files.length) return
    setError('')
    let last = ''
    for (const f of files) {
      try {
        const t = await importTestFile(f)
        last = create(t.title, t.questions)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Не вдалося прочитати файл.')
      }
    }
    if (files.length === 1 && last) navigate(`/tests/${last}`)
  }

  async function remove(t: Test) {
    if (await ask(`Видалити тест «${t.title}» (${t.questions.length} ${questionsWord(t.questions.length)})?`))
      removeDoc('tests', t.id)
  }

  return (
    <div className="page">
      <main className="main">
        <Link to={`/ktp/${courseId}`} className="back">
          <ArrowLeft size={14} /> {courseTitle(course)}
        </Link>
        <div className="sec-head page-head">
          <h1>Тести</h1>
          <span className="grow" />
          <div className="actions">
            <button className="btn ghost" onClick={() => fileInput.current?.click()}>
              <FileUp size={15} /> З Excel
            </button>
            <button className="btn" onClick={() => navigate(`/tests/${create('Новий тест', [])}`)}>
              <Plus size={15} /> Новий тест
            </button>
          </div>
          <input
            ref={fileInput}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            multiple
            hidden
            onChange={(e) => (importFiles(e.target.files), (e.target.value = ''))}
          />
        </div>
        {error && <p className="field-error">{error}</p>}

        {!sorted.length && (
          <section className="empty" style={{ background: 'var(--surface)' }}>
            <div>
              <h2>Тестів поки немає</h2>
              <p>
                Завантаж готовий файл .xlsx у форматі Wayground (наприклад, той, що зробив Claude) або створи тест тут.
                Потім прив’яжи його до уроку чи теми, і він з’явиться на «Сьогодні».
              </p>
            </div>
          </section>
        )}

        <div className="test-list">
          {sorted.map((t) => (
            <article key={t.id} className="test-item">
              <Link to={`/tests/${t.id}`} className="grow">
                <b>{t.title}</b>
                <span>
                  {t.questions.length} {questionsWord(t.questions.length)} · {targetLabel(t, topics, lessons)}
                </span>
              </Link>
              <button
                className="icon-btn"
                disabled={!t.questions.length}
                onClick={() => exportTest(t)}
                aria-label={`Завантажити «${t.title}» для Wayground`}
                title="Файл для Wayground"
              >
                <Download size={15} />
              </button>
              <button className="icon-btn del" onClick={() => remove(t)} aria-label={`Видалити «${t.title}»`}>
                <Trash2 size={15} />
              </button>
            </article>
          ))}
        </div>
      </main>
    </div>
  )
}
