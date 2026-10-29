import { Check } from 'lucide-react'
import { useEffect, useState } from 'react'
import { registerSaved } from '../lib/saved'

export function SavedToast() {
  const [n, setN] = useState(0)

  useEffect(() => registerSaved(() => setN((x) => x + 1)), [])

  useEffect(() => {
    if (!n) return
    const t = setTimeout(() => setN(0), 1500)
    return () => clearTimeout(t)
  }, [n])

  if (!n) return null
  return (
    <div className="saved-toast" role="status">
      <Check size={14} /> Збережено
    </div>
  )
}
