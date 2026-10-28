import templateUrl from '../assets/wayground_template.xlsx?url'
import { questionRow, questionsFromRows, titleFromFile } from '../data/tests'
import type { Question, Test } from '../data/types'
import { buildXlsx, readXlsx } from '../import/xlsx'

/** Питання з файлу .xlsx у форматі Wayground. */
export async function importTestFile(file: File): Promise<{ title: string; questions: Question[] }> {
  const questions = questionsFromRows(await readXlsx(file))
  if (!questions.length) throw new Error(`У файлі «${file.name}» не знайдено питань у форматі Wayground.`)
  return { title: titleFromFile(file.name), questions }
}

/** Зберігає тест файлом для імпорту в Wayground (на основі офіційного шаблону). */
export async function exportTest(test: Test) {
  const template = new Uint8Array(await (await fetch(templateUrl)).arrayBuffer())
  const bytes = buildXlsx(template, test.questions.map(questionRow))
  const blob = new Blob([bytes as BlobPart], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `Тест_${test.title.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'Wayground'}.xlsx`
  // Посилання має бути в документі, інакше деякі браузери ігнорують назву файлу.
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
