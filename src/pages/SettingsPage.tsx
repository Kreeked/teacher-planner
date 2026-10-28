import { Download, LogOut, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { useAuth } from '../auth/context'
import { OfflineFilesSection } from './settings/OfflineFilesSection'
import { BackupError, countDocs, downloadJson, exportBackup, parseBackup, restoreBackup } from '../data/backup'

export function SettingsPage() {
  const { user, signOut } = useAuth()
  const fileInput = useRef<HTMLInputElement>(null)
  const [backupMsg, setBackupMsg] = useState('')

  async function handleExport() {
    try {
      const data = await exportBackup()
      downloadJson(data, `planer-${new Date().toISOString().slice(0, 10)}.json`)
      setBackupMsg(`Збережено записів: ${countDocs(data)}`)
    } catch (e) {
      console.error(e)
      setBackupMsg('Не вдалося створити копію')
    }
  }

  async function handleRestore(file: File) {
    try {
      const data = parseBackup(await file.text())
      const when = new Date(data.exported_at).toLocaleString('uk-UA')
      if (!confirm(`Замінити всі поточні дані копією від ${when} (записів: ${countDocs(data)})?`)) return
      await restoreBackup(data)
      setBackupMsg('Дані відновлено з копії')
    } catch (e) {
      console.error(e)
      setBackupMsg(e instanceof BackupError ? e.message : 'Не вдалося прочитати файл')
    }
  }

  return (
    <div className="page">
      <main className="main">
        <h1>Налаштування</h1>

        <section className="panel">
          <h3>Обліковий запис</h3>
          <div className="account">
            {user?.photoURL && <img className="avatar" src={user.photoURL} alt="" referrerPolicy="no-referrer" />}
            <div className="grow">
              <b>{user?.displayName}</b>
              <span>{user?.email}</span>
            </div>
          </div>
          <button className="btn ghost" onClick={signOut}>
            <LogOut size={16} />
            Вийти
          </button>
        </section>

        <OfflineFilesSection />

        <section className="panel">
          <h3>Резервна копія</h3>
          <p className="muted">
            Усі дані планера одним файлом JSON. Збережи його, наприклад, на Google Диск, і зможеш відновити все за
            хвилину.
          </p>
          <div className="row-actions">
            <button className="btn" onClick={handleExport}>
              <Download size={16} /> Зберегти копію
            </button>
            <button className="btn ghost" onClick={() => fileInput.current?.click()}>
              <Upload size={16} /> Відновити з файлу
            </button>
          </div>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (f) handleRestore(f)
            }}
          />
          {backupMsg && <p className="muted">{backupMsg}</p>}
        </section>

        <section className="panel">
          <h3>Встановити на пристрій</h3>
          <ul className="steps">
            <li>
              <b>iPhone:</b> Safari → «Поділитися» → «На початковий екран».
            </li>
            <li>
              <b>Mac:</b> Safari → «Файл» → «Додати до Dock», або Chrome → значок встановлення в адресному рядку.
            </li>
            <li>
              <b>Без інтернету:</b> після першого входу застосунок відкривається і в режимі польоту.
            </li>
          </ul>
        </section>
      </main>
    </div>
  )
}
