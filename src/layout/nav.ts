import { BookOpen, Clock, House, Settings, type LucideIcon } from 'lucide-react'

export type NavItem = { to: string; label: string; icon: LucideIcon }

export const NAV: NavItem[] = [
  { to: '/', label: 'Сьогодні', icon: House },
  { to: '/ktp', label: 'КТП', icon: BookOpen },
  { to: '/schedule', label: 'Розклад', icon: Clock },
  { to: '/settings', label: 'Налаштування', icon: Settings },
]
