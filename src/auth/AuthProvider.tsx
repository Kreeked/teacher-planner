import { onAuthStateChanged, signInWithPopup, signInWithRedirect, signOut, type User } from 'firebase/auth'
import { useEffect, useState, type ReactNode } from 'react'
import { auth, googleProvider } from '../lib/firebase'
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
