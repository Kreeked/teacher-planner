import { collection, deleteDoc, doc, onSnapshot, query, where } from 'firebase/firestore'
import { useEffect, useState } from 'react'
import templateUrl from '../assets/wayground_template.xlsx?url'
import { createDoc } from '../data/db'
import { testFileName, testTarget, testXlsx, type LegacyTest } from '../data/legacyTests'
import { driveFolder } from '../data/materials'
import type { AcademicYear, Course, Lesson, LessonMaterial, Topic } from '../data/types'
import { uploadFile } from './drive'
import { auth, db } from './firebase'

// Колекція `tests` більше не входить у список колекцій застосунку, тож шлях будуємо тут.
const testsCol = (uid: string) => collection(db, 'users', uid, 'tests')

/** Старі тести курсу (з кешу, а потім із сервера). */
export function useLegacyTests(courseId: string) {
  const [state, setState] = useState<{ key: string; items: LegacyTest[] }>({ key: '', items: [] })
  const uid = auth.currentUser?.uid
  useEffect(() => {
    if (!uid || !courseId) return
    return onSnapshot(
      query(testsCol(uid), where('course_id', '==', courseId)),
      (snap) =>
        setState({
          key: courseId,
          items: snap.docs.map((d) => ({ ...(d.data() as Omit<LegacyTest, 'id'>), id: d.id })),
        }),
      (e) => console.error('Firestore read failed', e),
    )
  }, [uid, courseId])
  return state.key === courseId ? state.items : []
}

type Ctx = {
  course: Course
  year?: AcademicYear
  topics: Topic[]
  lessons: Lesson[]
  materials: LessonMaterial[]
}

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

/**
 * Переносить старі тести у файли .xlsx на Диску: файл → матеріал «Тест» → лише тоді видаляє тест.
 * Повертає кількість перенесених; помилка зупиняє перенесення (решта тестів лишається).
 */
export async function migrateTests(tests: LegacyTest[], ctx: Ctx, progress: (done: number) => void) {
  const uid = auth.currentUser?.uid
  if (!uid) throw new Error('Not signed in')
  const template = new Uint8Array(await (await fetch(templateUrl)).arrayBuffer())
  // Позиції нових матеріалів рахуємо самі: підписка може не встигнути оновитися між тестами.
  const used = new Map<string, number>()
  const nextPosition = (key: string, list: LessonMaterial[]) => {
    const n = used.get(key) ?? list.reduce((max, m) => Math.max(max, m.position + 1), 0)
    used.set(key, n + 1)
    return n
  }

  let done = 0
  for (const test of tests) {
    const target = testTarget(test, ctx.topics, ctx.lessons)
    if (!target) throw new Error('У КТП немає жодної теми, нікуди покласти тести.')
    const file = new File([testXlsx(template, test) as BlobPart], testFileName(test), { type: XLSX })
    const d = await uploadFile(file, driveFolder(ctx.year, ctx.course, target))
    const { lesson, topic } = target
    const position = lesson
      ? nextPosition(
          `l:${lesson.id}`,
          ctx.materials.filter((m) => m.lesson_id === lesson.id && m.category === 'test'),
        )
      : nextPosition(
          `t:${topic!.id}`,
          ctx.materials.filter((m) => m.topic_id === topic!.id && !m.lesson_id),
        )
    createDoc('lesson_materials', {
      course_id: ctx.course.id,
      lesson_id: lesson?.id ?? null,
      topic_id: lesson ? null : topic!.id,
      title: d.name,
      kind: 'file',
      drive_file_id: d.id,
      url: null,
      mime_type: d.mimeType,
      size_bytes: d.size,
      position,
      keep_offline: false,
      category: 'test',
    })
    await deleteDoc(doc(testsCol(uid), test.id))
    progress(++done)
  }
  return done
}
