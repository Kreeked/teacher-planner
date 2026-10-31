// Де зупинився користувач у початковому налаштуванні: крок зберігається на цьому пристрої, щоб після перезавантаження продовжити.
const key = (uid: string) => `planner.onboarding.${uid}`

export function getOnboardingStep(uid: string): number | null {
  try {
    const raw = localStorage.getItem(key(uid))
    const n = raw === null ? NaN : Number(raw)
    return Number.isInteger(n) && n >= 0 ? n : null
  } catch {
    return null
  }
}

export function setOnboardingStep(uid: string, step: number) {
  try {
    localStorage.setItem(key(uid), String(step))
  } catch {
    // Сховище недоступне: після перезавантаження просто почнемо з першого невиконаного кроку.
  }
}

export function clearOnboarding(uid: string) {
  try {
    localStorage.removeItem(key(uid))
  } catch {
    // нічого
  }
}
