import { CircleCheck, CloudDownload, CloudOff, Pin, RotateCcw, Trash2 } from 'lucide-react'
import { OFFLINE_DAYS, OFFLINE_LIMIT, type OfflineItem } from '../../data/offline'
import { formatSize } from '../../data/materials'
import { WEEKDAYS, weekday } from '../../data/schedule'
import { shortDate } from '../../data/year'
import { driveConfigured } from '../../lib/drive'
import { clearAll, clearStale, removeSaved, syncOffline, unskip } from '../../lib/offlineFiles'
import { useOfflinePlan } from '../../lib/useOfflinePlan'
import { useOnline } from '../../lib/useOnline'

function when(item: OfflineItem) {
  if (!item.date) return 'завжди'
  return `${WEEKDAYS.find((w) => w.value === weekday(item.date!))?.label ?? ''} ${shortDate(item.date)}`
}

/** Налаштування → Офлайн-файли: що збережено на пристрої і скільки місця займає. */
export function OfflineFilesSection() {
  const { plan, files, missing, loading } = useOfflinePlan()
  const online = useOnline()
  const used = [...files.saved.values()].reduce((sum, f) => sum + f.size, 0)
  const items = [...plan.keep, ...plan.over]
  const wanted = plan.keep.map((x) => x.material)
  const planned = new Set(items.map((x) => x.material.drive_file_id))
  // Копії, яких план уже не потребує: урок минув або матеріал прибрали.
  const stale = [...files.saved.values()].filter((f) => !planned.has(f.id))

  function clear() {
    if (confirm('Видалити всі копії з цього пристрою? Нові не зберігатимуться, доки не натиснеш «Зберегти зараз».'))
      clearAll()
  }

  return (
    <section className="panel offline-files">
      <h3>Офлайн-файли</h3>
      <p className="muted">
        Файли до уроків на найближчі {OFFLINE_DAYS} днів і позначені шпилькою <Pin size={12} /> зберігаються на цьому
        пристрої, тож відкриваються і без інтернету. Копії минулих уроків видаляються самі, а окремий файл можна
        прибрати вручну. Посилання на сайти без інтернету не працюють.
      </p>

      <div className="meter" role="img" aria-label={`Зайнято ${formatSize(used) || '0 МБ'} з 1 ГБ`}>
        <i style={{ width: `${Math.min(100, (used / OFFLINE_LIMIT) * 100)}%` }} />
      </div>
      <p className="small-text muted">
        Збережено файлів: {files.saved.size} ({formatSize(used) || '0 МБ'} з 1 ГБ).
        {!loading && missing.length > 0 && ` Ще не збережено: ${missing.length}.`}
        {plan.over.length > 0 && ` Не вмістилися в ліміт: ${plan.over.length}.`}
      </p>

      {items.length + stale.length > 0 && (
        <ul className="offline-list">
          {items.map((x) => {
            const id = x.material.drive_file_id!
            const saved = files.saved.get(id)
            const skipped = files.skipped.has(id)
            const over = plan.over.includes(x)
            return (
              <li key={id} className={over || skipped ? 'over' : ''}>
                {saved ? (
                  <CircleCheck size={14} className="ok" />
                ) : skipped ? (
                  <CloudOff size={14} />
                ) : (
                  <CloudDownload size={14} />
                )}
                <span className="grow">{x.material.title}</span>
                <small>{over ? 'не вміщується' : skipped ? 'не зберігається' : when(x)}</small>
                {saved && (
                  <button
                    className="icon-btn del"
                    disabled={files.running}
                    onClick={() => removeSaved(id)}
                    aria-label={`Прибрати з пристрою «${x.material.title}»`}
                    title="Прибрати з пристрою"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
                {skipped && (
                  <button
                    className="icon-btn"
                    onClick={() => unskip(id)}
                    aria-label={`Знову зберігати «${x.material.title}»`}
                    title="Знову зберігати"
                  >
                    <RotateCcw size={14} />
                  </button>
                )}
              </li>
            )
          })}
          {stale.map((f) => (
            <li key={f.id} className="over">
              <CircleCheck size={14} className="ok" />
              <span className="grow">{f.name}</span>
              <small>минулий урок</small>
              <button
                className="icon-btn del"
                disabled={files.running}
                onClick={() => removeSaved(f.id)}
                aria-label={`Прибрати з пристрою «${f.name}»`}
                title="Прибрати з пристрою"
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {files.running && (
        <p className="small-text">
          Зберігаю файли: {files.done} з {files.total}…
        </p>
      )}
      {files.error && <p className="field-error">{files.error}</p>}

      <div className="row-actions">
        <button
          className="btn"
          disabled={!driveConfigured || !online || files.running || loading || (!missing.length && !files.paused)}
          onClick={() => syncOffline(wanted, true)}
        >
          <CloudDownload size={16} /> Зберегти зараз
        </button>
        <button className="btn ghost" disabled={files.running || !stale.length} onClick={() => clearStale(wanted)}>
          Очистити минулі
        </button>
        <button className="btn ghost" disabled={files.running || !files.saved.size} onClick={clear}>
          <Trash2 size={16} /> Очистити все
        </button>
      </div>
      {files.paused && (
        <p className="small-text muted">
          Автоматичне збереження вимкнено після очищення. Натисни «Зберегти зараз», щоб увімкнути знову.
        </p>
      )}
      {!online && <p className="small-text muted">Без інтернету нові файли не збережуться.</p>}
    </section>
  )
}
