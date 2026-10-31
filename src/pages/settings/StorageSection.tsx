import { Database, HardDrive, RefreshCw, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { formatSize } from '../../data/materials'
import { ask } from '../../lib/confirm'
import { useOfflineFiles } from '../../lib/offlineFiles'
import { readStorage, wipeEverything, type StorageItem, type StorageReport } from '../../lib/storageInfo'

/** Налаштування → Пам'ять пристрою: усе, що застосунок зберігає в браузері, з можливістю очистити. */
export function StorageSection() {
  const [report, setReport] = useState<StorageReport | null>(null)
  const [busy, setBusy] = useState(false)
  // Список оновлюється й коли змінюються офлайн-файли (збережено нові, прибрано).
  const files = useOfflineFiles()

  const [tick, setTick] = useState(0)
  const refresh = () => setTick((t) => t + 1)
  useEffect(() => {
    let off = false
    readStorage()
      .then((r) => !off && setReport(r))
      .catch(console.error)
    return () => {
      off = true
    }
  }, [tick, files.saved.size])

  async function clear(item: StorageItem) {
    if (!item.clear) return
    const text = `Очистити «${item.label}»? ${item.warn ?? ''}`.trim()
    if (!(await ask(text, { ok: 'Очистити' }))) return
    setBusy(true)
    try {
      await item.clear()
    } finally {
      setBusy(false)
      refresh()
    }
  }

  async function wipe() {
    const text =
      'Стерти все на цьому пристрої: вихід з акаунта, локальну базу, кеші, файли й налаштування? ' +
      'Дані в хмарі лишаться, але зміни, які ще не синхронізувались, буде втрачено. Щоб зайти знову, потрібен інтернет.'
    if (!(await ask(text, { ok: 'Стерти все', word: 'очистити' }))) return
    setBusy(true)
    await wipeEverything()
  }

  const used = report?.usage ?? null
  const quota = report?.quota ?? null

  return (
    <section className="panel yp-block storage" aria-labelledby="st-storage">
      <h2 id="st-storage">Пам'ять пристрою</h2>
      <p className="muted">
        Усе, що застосунок зберігає в цьому браузері: файли до уроків, сам застосунок, локальна база й налаштування. Звідси
        можна очистити будь-який пункт; дані в хмарі це не зачепить.
      </p>

      {used !== null && (
        <>
          <div className="meter" role="img" aria-label={`Зайнято ${formatSize(used) || '0 МБ'}${quota ? ` з ${formatSize(quota)}` : ''}`}>
            <i style={{ width: `${quota ? Math.min(100, Math.max(1, (used / quota) * 100)) : 0}%` }} />
          </div>
          <p className="small-text muted">
            Разом зайнято {formatSize(used) || '0 МБ'}
            {quota ? ` (браузер дозволяє до ${formatSize(quota)})` : ''}.
          </p>
        </>
      )}

      {report && (
        <ul className="storage-list">
          {report.items.map((item) => (
            <li key={item.id}>
              {item.id === 'idb' ? <Database size={14} /> : <HardDrive size={14} />}
              <div className="grow">
                <b>{item.label}</b>
                <small>{item.hint}</small>
              </div>
              <span className="size">{item.bytes === null ? '—' : formatSize(item.bytes) || '0 КБ'}</span>
              {item.clear ? (
                <button
                  className="icon-btn del"
                  disabled={busy}
                  onClick={() => clear(item)}
                  aria-label={`Очистити «${item.label}»`}
                  title="Очистити"
                >
                  <Trash2 size={14} />
                </button>
              ) : (
                <span className="icon-btn" aria-hidden />
              )}
            </li>
          ))}
        </ul>
      )}
      {!report && <p className="small-text muted">Читаю…</p>}

      <div className="row-actions">
        <button className="btn ghost" disabled={busy} onClick={refresh}>
          <RefreshCw size={16} /> Оновити
        </button>
        <button className="btn ghost danger" disabled={busy} onClick={wipe}>
          <Trash2 size={16} /> Очистити все
        </button>
      </div>
    </section>
  )
}
