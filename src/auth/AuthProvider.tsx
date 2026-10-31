import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInAnonymously,
  signInWithCredential,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth'
import { useEffect, useState, type ReactNode } from 'react'
import { PopupClosed, forgetDriveToken, googleSignInToken } from '../lib/drive'
import { wipeForSignOut } from '../lib/offlineFiles'
import { auth, googleProvider, usingEmulators } from '../lib/firebase'
import { AuthContext } from './context'

// Після невдалого входу через Google Identity Services наступна спроба йде через спливне вікно Firebase.
let viaFirebase = false

// Чий вхід востаннє бачив цей пристрій: якщо зайшов інший акаунт (вихід минув повз кнопку), чужі копії файлів стираються.
const OWNER_KEY = 'device-owner'

function switchOwner(uid: string) {
  try {
    const prev = localStorage.getItem(OWNER_KEY)
    if (prev && prev !== uid) wipeForSignOut().catch(() => {})
    localStorage.setItem(OWNER_KEY, uid)
  } catch {
    // Без сховища перевірити власника неможливо.
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(auth.currentUser)
  const [loading, setLoading] = useState(true)

  useEffect(
    () =>
      onAuthStateChanged(auth, (u) => {
        if (u) switchOwner(u.uid)
        setUser(u)
        setLoading(false)
      }),
    [],
  )

  async function signIn() {
    if (usingEmulators) {
      await signInAnonymously(auth)
      return
    }
    // Основний шлях: вікно Google Identity Services, яке одразу дає й доступ до Диска (потім друге вікно не потрібне).
    // Якщо воно не вийшло, помилка показується на сторінці входу, а наступне натискання йде через Firebase:
    // нове вікно можна відкрити лише з нового натискання, інакше браузер його заблокує.
    // Перенаправлення (signInWithRedirect) не використовуємо: у браузерах з розділеним сховищем (iPhone) воно не завершує вхід.
    if (!viaFirebase) {
      try {
        await signInWithCredential(auth, GoogleAuthProvider.credential(null, await googleSignInToken()))
        return
      } catch (e) {
        if (e instanceof PopupClosed) throw e
        viaFirebase = true
        throw e
      }
    }
    await signInWithPopup(auth, googleProvider)
  }

  async function logOut() {
    forgetDriveToken()
    await wipeForSignOut().catch(() => {})
    try {
      localStorage.removeItem(OWNER_KEY)
    } catch {
      // Без сховища нічого забувати.
    }
    await signOut(auth)
  }

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut: logOut }}>
      {children}
    </AuthContext.Provider>
  )
}
