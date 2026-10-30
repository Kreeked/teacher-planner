import { ArrowLeft } from 'lucide-react'
import type { MouseEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'

/** «Назад» повертає туди, звідки прийшли; без історії (пряме посилання) — на `fallback`. */
export function BackLink({ fallback }: { fallback: string }) {
  const navigate = useNavigate()
  function back(e: MouseEvent) {
    if ((window.history.state?.idx ?? 0) > 0) {
      e.preventDefault()
      navigate(-1)
    }
  }
  return (
    <Link to={fallback} className="back" onClick={back}>
      <ArrowLeft size={14} /> Назад
    </Link>
  )
}
