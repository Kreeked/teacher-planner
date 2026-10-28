import { BookOpen, CalendarDays, Clock, House, Settings, type LucideIcon } from 'lucide-react'

export type NavItem = { to: string; label: string; icon: LucideIcon }

export const NAV: NavItem[] = [
  { to: '/', label: 'Сьогодні', icon: House },
  { to: '/schedule', label: 'Розклад', icon: Clock },
  { to: '/ktp', label: 'КТП', icon: BookOpen },
  { to: '/calendar', label: 'Календар', icon: CalendarDays },
  { to: '/settings', label: 'Налаштування', icon: Settings },
]
