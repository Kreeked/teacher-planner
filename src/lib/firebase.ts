import { initializeApp } from 'firebase/app'
import { GoogleAuthProvider, connectAuthEmulator, getAuth } from 'firebase/auth'
import {
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore'

// Ці значення не секретні: вони потрапляють у браузер кожного відвідувача.
// Доступ до даних захищають правила Firestore (файл firestore.rules).
const firebaseConfig = {
  apiKey: 'AIzaSyAs_q3S-0HP0flCkBSXWxFeCvNgw0bnBD0',
  authDomain: 'teacher-planner-49257.firebaseapp.com',
  projectId: 'teacher-planner-49257',
  storageBucket: 'teacher-planner-49257.firebasestorage.app',
  messagingSenderId: '881971488492',
  appId: '1:881971488492:web:b00cb210630a8f7bb7a7c9',
}

export const app = initializeApp(firebaseConfig)

export const auth = getAuth(app)
auth.languageCode = 'uk'

export const googleProvider = new GoogleAuthProvider()
googleProvider.setCustomParameters({ prompt: 'select_account' })

// Локальний кеш Firestore: дані читаються й змінюються без інтернету,
// а зміни синхронізуються, щойно з'являється зв'язок. Кілька вкладок ділять один кеш.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
})

// Для розробки: `npm run emulators` і `npm run dev:emu` — локальна база замість справжньої.
export const usingEmulators = import.meta.env.VITE_EMULATORS === '1'
if (usingEmulators) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  connectFirestoreEmulator(db, '127.0.0.1', 8080)
}
