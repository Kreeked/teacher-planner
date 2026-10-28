import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type DocumentReference,
  type WriteBatch,
} from 'firebase/firestore'
import { useEffect, useState } from 'react'
import { auth, db } from '../lib/firebase'
import type { CollectionName, Collections, NewDoc } from './types'

function uid() {
  const u = auth.currentUser
  if (!u) throw new Error('Not signed in')
  return u.uid
}

export function col(name: CollectionName) {
  return collection(db, 'users', uid(), name)
}

export function ref(name: CollectionName, id: string) {
  return doc(db, 'users', uid(), name, id)
}

// Записи не чекаємо: без інтернету проміс завершується лише після синхронізації,
// а локальний кеш оновлюється (і екран перемальовується) одразу.
function report(e: unknown) {
  console.error('Firestore write failed', e)
}

export function newRef(name: CollectionName): DocumentReference {
  return doc(col(name))
}

export function createDoc<N extends CollectionName>(name: N, data: NewDoc<Collections[N]>, batch?: WriteBatch) {
  const r = newRef(name)
  const payload = { ...data, owner_id: uid(), created_at: serverTimestamp(), updated_at: serverTimestamp() }
  if (batch) batch.set(r, payload)
  else setDoc(r, payload).catch(report)
  return r.id
}

export function updateFields<N extends CollectionName>(
  name: N,
  id: string,
  patch: Partial<NewDoc<Collections[N]>>,
  batch?: WriteBatch,
) {
  const payload = { ...patch, updated_at: serverTimestamp() }
  if (batch) batch.update(ref(name, id), payload)
  else updateDoc(ref(name, id), payload).catch(report)
}

export function removeDoc(name: CollectionName, id: string) {
  deleteDoc(ref(name, id)).catch(report)
}

/** Посилання на всі документи колекції з полем field == value (з кешу, якщо немає мережі). */
export async function refsWhere(name: CollectionName, field: string, value: string) {
  const snap = await getDocs(query(col(name), where(field, '==', value)))
  return snap.docs.map((d) => d.ref)
}

/** Видаляє документи пачками (у батчі Firestore не більше 500 операцій). */
export function deleteRefs(refs: DocumentReference[]) {
  for (let i = 0; i < refs.length; i += 450) {
    const batch = writeBatch(db)
    for (const r of refs.slice(i, i + 450)) batch.delete(r)
    commit(batch)
  }
}

/** Послідовність записів, що сама ділиться на батчі по 450 операцій. */
export class BatchWriter {
  private batches: WriteBatch[] = [writeBatch(db)]
  private ops = 0

  get batch() {
    if (this.ops === 450) {
      this.batches.push(writeBatch(db))
      this.ops = 0
    }
    this.ops++
    return this.batches[this.batches.length - 1]
  }

  commit() {
    this.batches.forEach(commit)
  }
}

export function newBatch() {
  return writeBatch(db)
}

export function commit(batch: WriteBatch) {
  batch.commit().catch(report)
}

type Filter = { field: string; value: string | number | boolean }

/** Підписка на колекцію (з кешу, а потім із сервера). Без фільтра — уся колекція; null — нічого. */
export function useCollection<N extends CollectionName>(name: N, filter?: Filter | null) {
  const key = filter === null ? null : `${name}|${filter?.field ?? ''}|${filter?.value ?? ''}`
  const [state, setState] = useState<{ key: string | null; items: Collections[N][] }>({ key: null, items: [] })
  const field = filter?.field
  const value = filter?.value

  useEffect(() => {
    if (key === null) return
    const q = field === undefined ? col(name) : query(col(name), where(field, '==', value))
    return onSnapshot(
      q,
      (snap) =>
        setState({
          key,
          items: snap.docs.map((d) => ({ ...(d.data() as Omit<Collections[N], 'id'>), id: d.id }) as Collections[N]),
        }),
      (e) => {
        console.error('Firestore read failed', e)
        setState({ key, items: [] })
      },
    )
  }, [key, name, field, value])

  // Поки нова підписка не віддала дані, старі не показуємо.
  const ready = state.key === key
  return { items: ready ? state.items : [], loading: key !== null && !ready }
}
