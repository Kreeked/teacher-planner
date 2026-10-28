import { lessonName, type Target } from '../../data/tests'
import type { Lesson, Topic } from '../../data/types'

type Props = {
  value: Target
  topics: Topic[]
  lessons: Lesson[]
  onChange: (t: Target) => void
}

/** Вибір уроку чи теми для тесту: теми групами, уроки всередині. */
export function TargetSelect({ value, topics, lessons, onChange }: Props) {
  const current = value.lesson_id ? `l:${value.lesson_id}` : value.topic_id ? `t:${value.topic_id}` : ''
  return (
    <select
      className="field"
      aria-label="Прив’язати до"
      value={current}
      onChange={(e) => {
        const [kind, id] = e.target.value.split(':')
        onChange({ lesson_id: kind === 'l' ? id : null, topic_id: kind === 't' ? id : null })
      }}
    >
      <option value="">Без прив’язки</option>
      {[...topics]
        .sort((a, b) => a.position - b.position)
        .map((t) => (
          <optgroup key={t.id} label={t.title}>
            <option value={`t:${t.id}`}>Уся тема «{t.title}»</option>
            {lessons
              .filter((l) => l.topic_id === t.id)
              .sort((a, b) => a.position - b.position)
              .map((l) => (
                <option key={l.id} value={`l:${l.id}`}>
                  {lessonName(l)}
                </option>
              ))}
          </optgroup>
        ))}
    </select>
  )
}
