import { strFromU8, unzipSync } from 'fflate'

export type Cell = { text: string; span: number }
export type Block = { kind: 'p'; text: string } | { kind: 'table'; rows: Cell[][] }

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'

function paragraphText(p: Element) {
  let s = ''
  for (const el of p.getElementsByTagNameNS(W, '*')) {
    if (el.localName === 't') s += el.textContent ?? ''
    else if (el.localName === 'tab') s += ' '
    else if (el.localName === 'br') s += '\n'
  }
  return s
}

function children(el: Element, name: string) {
  return [...el.children].filter((c) => c.namespaceURI === W && c.localName === name)
}

/** Абзаци й таблиці документа верхнього рівня, по порядку. Клітинка — її абзаци через перенесення рядка. */
export function readDocumentXml(xml: string): Block[] {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  const body = doc.getElementsByTagNameNS(W, 'body')[0]
  if (!body) throw new Error('word/document.xml without body')
  const blocks: Block[] = []
  for (const el of body.children) {
    if (el.localName === 'p') {
      const text = paragraphText(el).trim()
      if (text) blocks.push({ kind: 'p', text })
    } else if (el.localName === 'tbl') {
      const rows = children(el, 'tr').map((tr) =>
        children(tr, 'tc').map((tc) => {
          const span = tc.getElementsByTagNameNS(W, 'gridSpan')[0]?.getAttributeNS(W, 'val')
          const text = children(tc, 'p')
            .map((p) => paragraphText(p).trim())
            .filter(Boolean)
            .join('\n')
          return { text, span: span ? Number(span) : 1 }
        }),
      )
      blocks.push({ kind: 'table', rows })
    }
  }
  return blocks
}

export async function readDocx(file: Blob): Promise<Block[]> {
  const files = unzipSync(new Uint8Array(await file.arrayBuffer()), { filter: (f) => f.name === 'word/document.xml' })
  const xml = files['word/document.xml']
  if (!xml) throw new Error('Це не документ Word (.docx)')
  return readDocumentXml(strFromU8(xml))
}
