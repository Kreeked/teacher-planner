/**
 * Найпростіше читання й заповнення .xlsx без важких бібліотек: лише перший аркуш,
 * текст і числа. Для тестів Wayground цього досить, а шаблон зберігає свої стилі й підказки.
 */
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import type { Row } from '../data/tests'

const unescape = (s: string) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&')

const escape = (s: string) =>
  s
    // Керівні символи XML не допускає.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

/** Текст рядка з <si> чи <is>: усі <t> підряд (форматований текст ділиться на кілька). */
function runsText(xml: string) {
  return [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => unescape(m[1])).join('')
}

function colIndex(ref: string) {
  let n = 0
  for (const ch of ref.replace(/\d+$/, '')) n = n * 26 + ch.charCodeAt(0) - 64
  return n - 1
}

/** Рядки аркуша як масиви тексту клітинок. */
export function sheetRows(sheetXml: string, sharedXml = ''): string[][] {
  const shared = [...sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => runsText(m[1]))
  const rows: string[][] = []
  for (const row of sheetXml.matchAll(/<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const cells: string[] = []
    for (const c of (row[1] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1]
      const body = c[2] ?? ''
      const ref = /\br="([A-Z]+\d+)"/.exec(attrs)?.[1]
      if (!ref) continue
      const type = /\bt="(\w+)"/.exec(attrs)?.[1]
      const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1]
      let text = ''
      if (type === 's') text = shared[Number(v)] ?? ''
      else if (type === 'inlineStr') text = runsText(body)
      else if (v !== undefined) text = unescape(v)
      cells[colIndex(ref)] = text
    }
    rows.push(Array.from(cells, (x) => x ?? ''))
  }
  return rows
}

function firstSheetPath(files: Record<string, Uint8Array>) {
  const rels = files['xl/_rels/workbook.xml.rels'] && strFromU8(files['xl/_rels/workbook.xml.rels'])
  const wb = files['xl/workbook.xml'] && strFromU8(files['xl/workbook.xml'])
  const rid = wb && /<sheet\b[^>]*\br:id="([^"]+)"/.exec(wb)?.[1]
  const target =
    rid && rels && new RegExp(`Id="${rid}"[^>]*Target="([^"]+)"|Target="([^"]+)"[^>]*Id="${rid}"`).exec(rels)
  const path = target ? (target[1] ?? target[2]).replace(/^\/?(xl\/)?/, 'xl/') : 'xl/worksheets/sheet1.xml'
  return files[path] ? path : 'xl/worksheets/sheet1.xml'
}

export async function readXlsx(file: Blob): Promise<string[][]> {
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(new Uint8Array(await file.arrayBuffer()))
  } catch {
    throw new Error('Це не файл Excel (.xlsx)')
  }
  const sheet = files[firstSheetPath(files)]
  if (!sheet) throw new Error('У файлі немає аркуша з питаннями')
  const shared = files['xl/sharedStrings.xml']
  return sheetRows(strFromU8(sheet), shared ? strFromU8(shared) : '')
}

const COLS = 'ABCDEFGHIJK'

/**
 * Вписує рядки в аркуш шаблону починаючи з firstRow (рядки вище — заголовки).
 * Стилі клітинок беруться з першого рядка даних шаблону; старі приклади до clearTo стираються.
 */
export function fillSheet(sheetXml: string, rows: Row[], firstRow = 3, clearTo = 8) {
  const sample = new RegExp(`<row r="${firstRow}"[^>]*>([\\s\\S]*?)</row>`).exec(sheetXml)?.[1] ?? ''
  const style = new Map([...sample.matchAll(/<c r="([A-Z]+)\d+" s="(\d+)"/g)].map((m) => [m[1], m[2]]))
  const last = Math.max(clearTo, firstRow + rows.length - 1)

  const rowXml = (n: number) => {
    const values = rows[n - firstRow]
    if (!values) return `<row r="${n}" spans="1:11"/>`
    const cells = values.map((v, i) => {
      const col = COLS[i]
      const s = style.has(col) ? ` s="${style.get(col)}"` : ''
      if (v === null || v === '') return `<c r="${col}${n}"${s}/>`
      if (typeof v === 'number') return `<c r="${col}${n}"${s}><v>${v}</v></c>`
      return `<c r="${col}${n}"${s} t="inlineStr"><is><t xml:space="preserve">${escape(v)}</t></is></c>`
    })
    return `<row r="${n}" spans="1:11">${cells.join('')}</row>`
  }

  const done = new Set<number>()
  let xml = sheetXml.replace(/<row r="(\d+)"[^>]*?(?:\/>|>[\s\S]*?<\/row>)/g, (m, r) => {
    const n = Number(r)
    if (n < firstRow || n > last) return m
    done.add(n)
    return rowXml(n)
  })
  // Рядків, яких не було в шаблоні, додаємо в кінець по порядку.
  const extra: string[] = []
  for (let n = firstRow; n <= last; n++) if (!done.has(n)) extra.push(rowXml(n))
  if (extra.length) {
    // Вставляємо перед першим рядком з більшим номером, щоб зберегти порядок.
    xml = xml.replace(/<sheetData>([\s\S]*?)<\/sheetData>/, (_, body: string) => {
      const all = [...body.matchAll(/<row r="(\d+)"[^>]*?(?:\/>|>[\s\S]*?<\/row>)/g)].map((m) => ({
        n: Number(m[1]),
        xml: m[0],
      }))
      for (const e of extra) all.push({ n: Number(/r="(\d+)"/.exec(e)![1]), xml: e })
      all.sort((a, b) => a.n - b.n)
      return `<sheetData>${all.map((x) => x.xml).join('')}</sheetData>`
    })
  }
  return xml
}

/** Файл Wayground з шаблону й рядків питань. */
export function buildXlsx(template: Uint8Array, rows: Row[]) {
  const files = unzipSync(template)
  const path = firstSheetPath(files)
  files[path] = strToU8(fillSheet(strFromU8(files[path]), rows))
  return zipSync(files)
}
