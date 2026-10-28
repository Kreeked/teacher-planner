/**
 * Робота з Google Диском: вхід через Google Identity Services (лише доступ drive.file —
 * застосунок бачить тільки файли, які сам створив або які вибрано в Picker),
 * завантаження файлів частинами і вибір наявних файлів.
 */
import { auth } from './firebase'

// OAuth Client ID вебклієнта проєкту teacher-planner-49257 (не секретний).
export const DRIVE_CLIENT_ID: string = '881971488492-44pps9dgl2g2vn62ueis0lbf69h1287n.apps.googleusercontent.com'
const API_KEY = 'AIzaSyAs_q3S-0HP0flCkBSXWxFeCvNgw0bnBD0'
const PROJECT_NUMBER = '881971488492'
const SCOPE = 'https://www.googleapis.com/auth/drive.file'
const FOLDER = 'application/vnd.google-apps.folder'
// Частина для завантаження: кратна 256 КБ.
const CHUNK = 8 * 1024 * 1024

export const driveConfigured = DRIVE_CLIENT_ID !== ''

export type DriveFile = { id: string; name: string; mimeType: string; size: number | null }

export class DriveError extends Error {}

// ---------- Скрипти Google ----------

const scripts = new Map<string, Promise<void>>()

function loadScript(src: string) {
  let p = scripts.get(src)
  if (!p) {
    p = new Promise<void>((resolve, reject) => {
      const s = document.createElement('script')
      s.src = src
      s.async = true
      s.onload = () => resolve()
      s.onerror = () => {
        scripts.delete(src)
        reject(new DriveError('Не вдалося завантажити компонент Google. Перевір інтернет.'))
      }
      document.head.appendChild(s)
    })
    scripts.set(src, p)
  }
  return p
}

/** Завантажує скрипти наперед, щоб вікно дозволу відкрилося одразу після натискання. */
export function preloadDrive() {
  if (!driveConfigured || !navigator.onLine) return
  loadScript('https://accounts.google.com/gsi/client').catch(() => {})
  loadScript('https://apis.google.com/js/api.js').catch(() => {})
}

// ---------- Токен доступу ----------

let token: { value: string; expires: number } | null = null

/** Токен для Drive API; уперше (і коли сплив) — вікно дозволу Google. Викликати з обробника натискання. */
export async function driveToken(): Promise<string> {
  if (!driveConfigured) throw new DriveError('Підключення до Google Диска ще не налаштоване.')
  if (token && token.expires > Date.now() + 60_000) return token.value
  await loadScript('https://accounts.google.com/gsi/client')
  return new Promise((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: DRIVE_CLIENT_ID,
      scope: SCOPE,
      hint: auth.currentUser?.email ?? undefined,
      callback: (r) => {
        if (r.error || !r.access_token) {
          reject(new DriveError('Google не дав доступу до Диска.'))
          return
        }
        token = { value: r.access_token, expires: Date.now() + Number(r.expires_in) * 1000 }
        resolve(r.access_token)
      },
      error_callback: () => reject(new DriveError('Вікно дозволу Google закрито.')),
    })
    client.requestAccessToken({ prompt: '' })
  })
}

async function api<T>(url: string, init: RequestInit = {}): Promise<T> {
  const t = await driveToken()
  const r = await fetch(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${t}` } })
  if (r.status === 401) token = null
  if (!r.ok) throw new DriveError(`Google Диск відповів помилкою ${r.status}.`)
  return r.json() as Promise<T>
}

// ---------- Папки ----------

const folders = new Map<string, string>()

function quote(s: string) {
  return `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
}

/** Папка «Планер / … / …»: знаходить створену раніше або створює нову. */
export async function ensureFolder(path: string[]): Promise<string> {
  let parent = 'root'
  for (let i = 0; i < path.length; i++) {
    const key = path.slice(0, i + 1).join('/')
    const cached = folders.get(key)
    if (cached) {
      parent = cached
      continue
    }
    const name = path[i]
    const q = `name = ${quote(name)} and mimeType = '${FOLDER}' and ${quote(parent)} in parents and trashed = false`
    const found = await api<{ files: { id: string }[] }>(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)&spaces=drive`,
    )
    parent =
      found.files[0]?.id ??
      (
        await api<{ id: string }>('https://www.googleapis.com/drive/v3/files?fields=id', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, mimeType: FOLDER, parents: [parent] }),
        })
      ).id
    folders.set(key, parent)
  }
  return parent
}

// ---------- Завантаження ----------

/** Завантажує файл частинами (обрив зв'язку не губить уже передане). progress — від 0 до 1. */
export async function uploadFile(file: File, folderPath: string[], progress?: (p: number) => void): Promise<DriveFile> {
  const folderId = await ensureFolder(folderPath)
  const t = await driveToken()
  const start = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,mimeType,size',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${t}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': file.type || 'application/octet-stream',
        'X-Upload-Content-Length': String(file.size),
      },
      body: JSON.stringify({ name: file.name, parents: [folderId] }),
    },
  )
  const session = start.headers.get('Location')
  if (!start.ok || !session) throw new DriveError(`Google Диск не прийняв файл (${start.status}).`)

  let offset = 0
  for (;;) {
    const end = Math.min(offset + CHUNK, file.size)
    const r = await sendChunk(session, file, offset, end)
    if (r.status === 200 || r.status === 201) {
      progress?.(1)
      const f = (await r.json()) as { id: string; name: string; mimeType: string; size?: string }
      return { id: f.id, name: f.name, mimeType: f.mimeType, size: f.size ? Number(f.size) : file.size }
    }
    if (r.status !== 308) throw new DriveError(`Завантаження перервалося (${r.status}).`)
    // Сервер каже, скільки байтів уже має: продовжуємо з цього місця.
    const range = r.headers.get('Range')
    offset = range ? Number(range.split('-')[1]) + 1 : end
    progress?.(offset / file.size)
  }
}

async function sendChunk(session: string, file: File, from: number, to: number) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetch(session, {
        method: 'PUT',
        headers: { 'Content-Range': file.size ? `bytes ${from}-${to - 1}/${file.size}` : 'bytes */0' },
        body: file.slice(from, to),
      })
    } catch (e) {
      // Мережа зникла: чекаємо й пробуємо ту саму частину ще раз.
      if (attempt >= 4) throw new DriveError("Немає зв'язку з Google Диском. Спробуй пізніше.", { cause: e })
      await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt))
    }
  }
}

// ---------- Вибір файлу з Диска ----------

/** Вікно Google Picker; повертає вибрані файли (порожньо, якщо закрили). */
export async function pickFiles(): Promise<DriveFile[]> {
  const t = await driveToken()
  await loadScript('https://apis.google.com/js/api.js')
  await new Promise<void>((resolve) => gapi.load('picker', () => resolve()))
  return new Promise((resolve) => {
    const view = new google.picker.DocsView(google.picker.ViewId.DOCS)
      .setIncludeFolders(true)
      .setSelectFolderEnabled(false)
    const picker = new google.picker.PickerBuilder()
      .setAppId(PROJECT_NUMBER)
      .setDeveloperKey(API_KEY)
      .setOAuthToken(t)
      .setLocale('uk')
      .addView(view)
      .addView(new google.picker.DocsUploadView())
      .enableFeature(google.picker.Feature.MULTISELECT_ENABLED)
      .setCallback((data: google.picker.ResponseObject) => {
        const action = data[google.picker.Response.ACTION]
        if (action === google.picker.Action.CANCEL) resolve([])
        if (action !== google.picker.Action.PICKED) return
        resolve(
          (data[google.picker.Response.DOCUMENTS] ?? []).map((d: google.picker.DocumentObject) => ({
            id: d[google.picker.Document.ID],
            name: d[google.picker.Document.NAME] ?? 'Файл',
            mimeType: d[google.picker.Document.MIME_TYPE] ?? '',
            size: d.sizeBytes ? Number(d.sizeBytes) : null,
          })),
        )
      })
      .build()
    picker.setVisible(true)
  })
}

