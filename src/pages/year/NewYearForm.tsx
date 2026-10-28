import { useState } from 'react'
import { DatePicker } from '../../components/DatePicker'
import { commit, createDoc, newBatch } from '../../data/db'
import { defaultYear, defaultYearStart, validateYear } from '../../data/year'

export function NewYearForm({ onCreated, makeCurrent }: { onCreated: (id: string) => void; makeCurrent: boolean }) {
  const [initial] = useState(() => defaultYear(defaultYearStart(new Date())))
  const [title, setTitle] = useState(initial.title)
  const [start, setStart] = useState(initial.start_date)
  const [end, setEnd] = useState(initial.end_date)
  const [withSemesters, setWithSemesters] = useState(true)

  const error = validateYear({ start_date: start, end_date: end }, [])

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (error || !title.trim()) return
    const batch = newBatch()
    const yearId = createDoc(
      'academic_years',
      { title: title.trim(), start_date: start, end_date: end, is_current: makeCurrent },
      batch,
    )
    if (withSemesters) {
      // Типові семестри підганяємо під введені дати року.
      const tpl = defaultYear(Number(start.slice(0, 4))).semesters
      tpl.forEach((s, i) =>
        createDoc(
          'periods',
          {
            academic_year_id: yearId,
            parent_id: null,
            kind: 'semester',
            title: s.title,
            start_date: i === 0 ? start : s.start_date,
            end_date: i === tpl.length - 1 ? end : s.end_date,
            position: i,
          },
          batch,
        ),
      )
    }
    commit(batch)
    onCreated(yearId)
  }

  return (
    <form className="panel form" onSubmit={submit}>
      <h3>Новий навчальний рік</h3>
      <label>
        Назва
        <input className="field" value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <div className="form-row">
        <div className="label">
          Початок
          <DatePicker label="Початок року" value={start || null} onChange={(d) => setStart(d ?? '')} />
        </div>
        <div className="label">
          Кінець
          <DatePicker
            label="Кінець року"
            value={end || null}
            min={start || undefined}
            onChange={(d) => setEnd(d ?? '')}
          />
        </div>
      </div>
      <label className="check">
        <input type="checkbox" checked={withSemesters} onChange={(e) => setWithSemesters(e.target.checked)} />
        Одразу додати два семестри (дати можна змінити)
      </label>
      {error && <p className="field-error">{error}</p>}
      <button className="btn" disabled={!!error || !title.trim()}>
        Створити рік
      </button>
    </form>
  )
}
