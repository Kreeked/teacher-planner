/**
 * Робота з Google Диском: вхід через Google Identity Services (лише доступ drive.file —
 * застосунок бачить тільки файли, які сам створив або які вибрано в Picker),
 * завантаження файлів частинами і вибір наявних файлів.
 */
import { ask } from './confirm'
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

type Token = { value: string; expires: number }

// Токен живе годину; зберігаємо його, щоб офлайн-копії оновлювались і після перезапуску без вікна Google.
const TOKEN_KEY = 'drive-token'
let token: Token | null = readToken()

function readToken(): Token | null {
  try {
    const t = JSON.parse(localStorage.getItem(TOKEN_KEY) ?? 'null') as Token | null
    return t && t.expires > Date.now() ? t : null
  } catch {
    return null
  }
}

function saveToken(t: Token | null) {
  token = t
  try {
    if (t) localStorage.setItem(TOKEN_KEY, JSON.stringify(t))
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    // Без сховища токен просто житиме до перезавантаження.
  }
}

/** Забуває токен Диска: після виходу з акаунта його не має підхопити інший користувач. */
export function forgetDriveToken() {
  saveToken(null)
}

/** Чинний токен без вікна Google, або null. Для фонової роботи. */
export function savedDriveToken() {
  return token && token.expires > Date.now() + 5 * 60_000 ? token.value : null
}

/** Вікно дозволу Google не відкрилося (браузер заблокував) або його закрито. */
class PopupBlocked extends DriveError {}
/** Користувач увійшов, але не дозволив доступ до Диска (знятий прапорець у вікні Google). */
class NoDriveAccess extends DriveError {}
export class PopupClosed extends DriveError {
  code = 'auth/popup-closed-by-user'
}

/** Просить токен у Google. Відкриває вікно, тож викликати слід одразу з обробника натискання. */
function requestToken(scope: string, prompt: string): Promise<Token & { drive: boolean }> {
  return new Promise((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: DRIVE_CLIENT_ID,
      scope,
      hint: auth.currentUser?.email ?? undefined,
      callback: (r) => {
        if (r.error || !r.access_token) {
          reject(new DriveError('Google не дав доступу до Диска.'))
          return
        }
        const t = { value: r.access_token, expires: Date.now() + Number(r.expires_in) * 1000 }
        // Google дозволяє зняти окремий прапорець доступу до Диска: такий токен для Диска марний.
        const drive = google.accounts.oauth2.hasGrantedAllScopes(r, SCOPE)
        if (drive) saveToken(t)
        resolve({ ...t, drive })
      },
      error_callback: (e) =>
        reject(
          e?.type === 'popup_failed_to_open'
            ? new PopupBlocked('Браузер заблокував вікно Google.')
            : new PopupClosed('Вікно дозволу Google закрито.'),
        ),
    })
    client.requestAccessToken({ prompt })
  })
}

/**
 * Вхід і доступ до Диска одним вікном Google: повертає токен, яким Firebase впускає в акаунт.
 * Скрипт Google має бути завантажений наперед (preloadDrive), інакше вікно блокуватиметься браузером.
 */
export async function googleSignInToken(): Promise<string> {
  if (!driveConfigured || typeof google === 'undefined' || !google.accounts) {
    throw new DriveError('Компонент Google ще не завантажився.')
  }
  const t = await requestToken(`openid email profile ${SCOPE}`, 'select_account')
  return t.value
}

/**
 * Токен для Drive API; уперше (і коли сплив) — вікно дозволу Google. Викликати з обробника натискання.
 * reconsent — попередній токен не підійшов (Диск відповів 401/403): просимо дозвіл наново.
 */
export async function driveToken(reconsent = false): Promise<string> {
  if (!driveConfigured) throw new DriveError('Підключення до Google Диска ще не налаштоване.')
  if (!reconsent && token && token.expires > Date.now() + 60_000) return token.value
  await loadScript('https://accounts.google.com/gsi/client')
  let prompt = reconsent ? 'consent' : ''
  let why = reconsent ? 'Google Диск не дав доступу.' : ''
  for (let attempt = 0; ; attempt++) {
    try {
      if (why) {
        // Нове вікно можна відкрити лише з нового натискання, тож просимо його в застосунку.
        const again = await ask(`${why} Дозволь застосунку доступ до Диска у вікні Google: постав галочку біля Диска.`, {
          ok: 'Відкрити вікно Google',
          danger: false,
        })
        if (!again) throw new PopupClosed('Вікно дозволу Google закрито.')
      }
      const t = await requestToken(SCOPE, prompt)
      if (t.drive) return t.value
      throw new NoDriveAccess('Доступ до Диска не надано.')
    } catch (e) {
      if (attempt >= 2 || !(e instanceof PopupBlocked || e instanceof NoDriveAccess)) throw e
      prompt = 'consent'
      why = e instanceof PopupBlocked ? 'Браузер заблокував вікно Google.' : 'Доступ до Диска не надано.'
    }
  }
}

/** Відповідь Диска «токен недійсний або не має потрібного доступу» (а не, скажімо, ліміт запитів чи чужий файл). */
async function noAccess(r: Response) {
  if (r.status === 401) return true
  if (r.status !== 403) return false
  const body = (await r.clone().json().catch(() => null)) as { error?: { errors?: { reason?: string }[] } } | null
  return body?.error?.errors?.some((e) => e.reason === 'insufficientPermissions') ?? false
}

/** Запит до Drive API з токеном; якщо Диск відмовив (401/403 — не надано доступ), просить дозвіл і пробує ще раз. */
async function fetchAuthed(url: string, init: RequestInit = {}) {
  const send = async (t: string) =>
    fetch(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${t}` } })
  let r = await send(await driveToken())
  if (await noAccess(r)) {
    saveToken(null)
    r = await send(await driveToken(true))
    if (await noAccess(r)) saveToken(null)
  }
  return r
}

/** Зрозуміле пояснення помилки Диска; reason — з тіла відповіді. */
async function failure(r: Response) {
  const body = (await r.clone().json().catch(() => null)) as { error?: { errors?: { reason?: string }[] } } | null
  const reason = body?.error?.errors?.[0]?.reason
  if (reason === 'exportSizeLimitExceeded') return new DriveError('Файл завеликий, щоб Google зробив із нього PDF (понад 10 МБ).')
  if (r.status === 404) return new DriveError('Файл не знайдено на Диску або застосунок не має до нього доступу. Додай файл з Диска ще раз.')
  if (r.status === 403) return new DriveError('Google Диск не дозволив доступ до файлу.')
  return new DriveError(`Google Диск відповів помилкою ${r.status}.`)
}

async function api<T>(url: string, init: RequestInit = {}): Promise<T> {
  const r = await fetchAuthed(url, init)
  if (!r.ok) throw await failure(r)
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
  const start = await fetchAuthed(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,mimeType,size',
    {
      method: 'POST',
      headers: {
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

// ---------- Завантаження копії ----------

// Файли Google (Документи, Презентації, Таблиці) не мають власного вмісту — беремо PDF-версію.
const GOOGLE_APPS = 'application/vnd.google-apps.'

async function authorized(url: string, init: RequestInit = {}) {
  const r = await fetchAuthed(url, init)
  if (!r.ok) throw await failure(r)
  return r
}

/** Вміст файлу з Диска: як є, а файли Google — у вигляді PDF. */
export async function downloadFile(id: string, mimeType: string | null): Promise<Blob> {
  const url = mimeType?.startsWith(GOOGLE_APPS)
    ? `https://www.googleapis.com/drive/v3/files/${id}/export?mimeType=application/pdf`
    : `https://www.googleapis.com/drive/v3/files/${id}?alt=media`
  return (await authorized(url)).blob()
}

/**
 * PDF-версія офісного файлу (pptx, docx, xlsx…): Диск робить тимчасову копію як файл Google,
 * з неї береться PDF, копія одразу видаляється — на Диску нічого не лишається.
 */
export async function convertToPdf(id: string, googleMime: string): Promise<Blob> {
  const copy = await (
    await authorized(`https://www.googleapis.com/drive/v3/files/${id}/copy?fields=id`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mimeType: googleMime, name: 'Тимчасова копія для перегляду' }),
    })
  ).json() as { id: string }
  try {
    return await downloadFile(copy.id, googleMime)
  } finally {
    authorized(`https://www.googleapis.com/drive/v3/files/${copy.id}`, { method: 'DELETE' }).catch(() => {})
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
