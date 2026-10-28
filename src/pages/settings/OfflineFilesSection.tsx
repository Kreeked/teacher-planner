import { CircleCheck, CloudDownload, Pin } from 'lucide-react'
import { OFFLINE_DAYS, OFFLINE_LIMIT, type OfflineItem } from '../../data/offline'
import { formatSize } from '../../data/materials'
import { WEEKDAYS, weekday } from '../../data/schedule'
import { shortDate } from '../../data/year'
import { driveConfigured } from '../../lib/drive'
import { syncOffline } from '../../lib/offlineFiles'
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

  return (
    <section className="panel offline-files">
      <h3>Офлайн-файли</h3>
      <p className="muted">
        Файли до уроків на найближчі {OFFLINE_DAYS} днів і позначені шпилькою <Pin size={12} /> зберігаються на цьому
        пристрої, тож відкриваються і без інтернету. Копії минулих уроків видаляються самі. Посилання на сайти без
        інтернету не працюють.
      </p>

      <div className="meter" role="img" aria-label={`Зайнято ${formatSize(used) || '0 МБ'} з 1 ГБ`}>
        <i style={{ width: `${Math.min(100, (used / OFFLINE_LIMIT) * 100)}%` }} />
      </div>
      <p className="small-text muted">
        Збережено файлів: {files.saved.size} ({formatSize(used) || '0 МБ'} з 1 ГБ).
        {!loading && missing.length > 0 && ` Ще не збережено: ${missing.length}.`}
        {plan.over.length > 0 && ` Не вмістилися в ліміт: ${plan.over.length}.`}
      </p>

      {items.length > 0 && (
        <ul className="offline-list">
          {items.map((x) => {
            const saved = files.saved.get(x.material.drive_file_id!)
            const over = plan.over.includes(x)
            return (
              <li key={x.material.drive_file_id} className={over ? 'over' : ''}>
                {saved ? <CircleCheck size={14} className="ok" /> : <CloudDownload size={14} />}
                <span className="grow">{x.material.title}</span>
                <small>{over ? 'не вміщується' : when(x)}</small>
              </li>
            )
          })}
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
          disabled={!driveConfigured || !online || files.running || loading || !missing.length}
          onClick={() =>
            syncOffline(
              plan.keep.map((x) => x.material),
              true,
            )
          }
        >
          <CloudDownload size={16} /> Зберегти зараз
        </button>
      </div>
      {!online && <p className="small-text muted">Без інтернету нові файли не збережуться.</p>}
    </section>
  )
}
