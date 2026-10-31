import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInAnonymously,
  signInWithCredential,
  signInWithPopup,   signInWithRedirect,
  signOut,
  type User,
} from 'firebase/auth'
import { useEffect, useState, type ReactNode } from 'react'
import { PopupClosed, googleSignInToken } from '../lib/drive'
import { auth, googleProvider, usingEmulators } from '../lib/firebase'
import { AuthContext } from './context'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(auth.currentUser)
  const [loading, setLoading] = useState(true)

  useEffect(
    () =>
      onAuthStateChanged(auth, (u) => {
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
    // Якщо воно не вийшло (заблоковане, Firebase не прийняв токен) — старий вхід через Firebase.
    try {
      await signInWithCredential(auth, GoogleAuthProvider.credential(null, await googleSignInToken()))
      return
    } catch (e) {
      if (e instanceof PopupClosed) throw e
    }
    try {
      await signInWithPopup(auth, googleProvider)
    } catch (e) {
      // Якщо браузер заблокував спливне вікно — входимо через перенаправлення.
      const code = (e as { code?: string }).code
      if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
        await signInWithRedirect(auth, googleProvider)
        return
      }
      throw e
    }
  }

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut: () => signOut(auth) }}>
      {children}
    </AuthContext.Provider>
  )
}
