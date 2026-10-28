import { LogOut } from 'lucide-react'
import { useAuth } from '../auth/context'

export function SettingsPage() {
  const { user, signOut } = useAuth()

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
