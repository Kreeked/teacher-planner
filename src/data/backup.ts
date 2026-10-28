import { getDocs, Timestamp, type WriteBatch } from 'firebase/firestore'
import { col, commit, newBatch, ref } from './db'
import { COLLECTION_NAMES, type CollectionName } from './types'

/** Помилка, текст якої можна показати користувачу. */
export class BackupError extends Error {}

const FORMAT = 'teacher-planner-backup'
const VERSION = 1

type Backup = {
  format: typeof FORMAT
  version: number
  exported_at: string
  collections: Partial<Record<CollectionName, Record<string, unknown>[]>>
}

// Firestore-дати → ISO-рядки з позначкою, щоб при відновленні повернути їх як дати.
function toPlain(v: unknown): unknown {
  if (v instanceof Timestamp) return { $ts: v.toDate().toISOString() }
  if (Array.isArray(v)) return v.map(toPlain)
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toPlain(x)]))
  return v
}

function fromPlain(v: unknown): unknown {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const o = v as Record<string, unknown>
    if (typeof o.$ts === 'string' && Object.keys(o).length === 1) return Timestamp.fromDate(new Date(o.$ts))
    return Object.fromEntries(Object.entries(o).map(([k, x]) => [k, fromPlain(x)]))
  }
  if (Array.isArray(v)) return v.map(fromPlain)
  return v
}

export async function exportBackup(): Promise<Backup> {
  const collections: Backup['collections'] = {}
  for (const name of COLLECTION_NAMES) {
    const snap = await getDocs(col(name))
    collections[name] = snap.docs.map((d) => ({ id: d.id, ...(toPlain(d.data()) as object) }))
  }
  return { format: FORMAT, version: VERSION, exported_at: new Date().toISOString(), collections }
}

export function parseBackup(text: string): Backup {
  const data = JSON.parse(text) as Backup
  if (data?.format !== FORMAT || typeof data.collections !== 'object') throw new BackupError('Це не резервна копія планера')
  if (data.version > VERSION) throw new BackupError('Копію створено новішою версією застосунку')
  return data
}

export function countDocs(b: Backup) {
  return Object.values(b.collections).reduce((n, list) => n + (list?.length ?? 0), 0)
}

/** Замінює всі дані користувача вмістом копії. */
export async function restoreBackup(b: Backup) {
  // Батч Firestore вміщує до 500 операцій.
  const batches: WriteBatch[] = [newBatch()]
  let ops = 0
  function op(fn: (batch: WriteBatch) => void) {
    if (ops === 450) {
      batches.push(newBatch())
      ops = 0
    }
    fn(batches[batches.length - 1])
    ops++
  }

  for (const name of COLLECTION_NAMES) {
    const snap = await getDocs(col(name))
    const keep = new Set((b.collections[name] ?? []).map((d) => String(d.id)))
    for (const d of snap.docs) if (!keep.has(d.id)) op((batch) => batch.delete(d.ref))
    for (const { id, ...data } of b.collections[name] ?? []) op((batch) => batch.set(ref(name, String(id)), fromPlain(data) as object))
  }
  batches.forEach(commit)
}

export function downloadJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
