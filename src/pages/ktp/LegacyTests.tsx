import { FileOutput, ListChecks } from 'lucide-react'
import { useState } from 'react'
import { testsWord } from '../../data/legacyTests'
import type { AcademicYear, Course, Lesson, LessonMaterial, Topic } from '../../data/types'
import { driveConfigured } from '../../lib/drive'
import { migrateTests, useLegacyTests } from '../../lib/migrateTests'
import { useOnline } from '../../lib/useOnline'

type Props = { course: Course; year?: AcademicYear; topics: Topic[]; lessons: Lesson[]; materials: LessonMaterial[] }

/** Рядок про старі тести курсу з кнопкою перенести їх у файли .xlsx уроків. */
export function LegacyTests({ course, year, topics, lessons, materials }: Props) {
  const tests = useLegacyTests(course.id)
  const online = useOnline()
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null)
  const [message, setMessage] = useState('')
  if (!tests.length && !busy && !message) return null

  async function run() {
    if (!driveConfigured) return setMessage('Підключення до Google Диска ще налаштовується, перенести поки не можна.')
    if (!navigator.onLine) return setMessage('Потрібен інтернет: файли тестів зберігаються на Google Диску.')
    setMessage('')
    setBusy({ done: 0, total: tests.length })
    try {
      const n = await migrateTests(tests, { course, year, topics, lessons, materials }, (done) =>
        setBusy({ done, total: tests.length }),
      )
      setMessage(`Готово, перенесено: ${n}. Файли — у поличках «Тест».`)
    } catch (e) {
      console.error(e)
      setMessage(
        e instanceof Error
          ? `Не вдалося перенести: ${e.message} Неперенесені тести лишилися на місці, можна спробувати ще раз.`
          : 'Не вдалося перенести. Можна спробувати ще раз.',
      )
    } finally {
      setBusy(null)
    }
  }

  return (
    <p className="offline-note legacy-tests">
      <ListChecks size={14} />
      <span className="grow">
        {busy
          ? `Переношу тести у файли: ${busy.done} з ${busy.total}…`
          : tests.length > 0
            ? `Є ${tests.length} ${testsWord(tests.length)}.`
            : ''}
        {message && <span className="muted"> {message}</span>}
      </span>
      {tests.length > 0 && !busy && (
        <button
          className="btn ghost small"
          onClick={run}
          title={online ? 'Кожен тест стане файлом .xlsx для Wayground у поличці «Тест»' : 'Потрібен інтернет'}
        >
          <FileOutput size={14} /> Перенести у файли
        </button>
      )}
    </p>
  )
}
