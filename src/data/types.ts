import type { Timestamp } from 'firebase/firestore'

// Дати зберігаємо рядками «РРРР-ММ-ДД»: вони не залежать від часового поясу і правильно сортуються.
export type ISODate = string

export type Meta = {
  id: string
  owner_id: string
  created_at?: Timestamp
  updated_at?: Timestamp
}

export type AcademicYear = Meta & {
  title: string
  start_date: ISODate
  end_date: ISODate
  is_current: boolean
}

export type PeriodKind = 'semester' | 'quarter' | 'other'

export type Period = Meta & {
  academic_year_id: string
  parent_id: string | null
  kind: PeriodKind
  title: string
  start_date: ISODate
  end_date: ISODate
  position: number
}

export type ClassGroup = Meta & {
  academic_year_id: string
  grade: number
  letter: string
  display_name: string
}

export type Collections = {
  academic_years: AcademicYear
  periods: Period
  class_groups: ClassGroup
}

export type CollectionName = keyof Collections

// Усі колекції користувача: з цього списку будується резервна копія.
export const COLLECTION_NAMES: CollectionName[] = ['academic_years', 'periods', 'class_groups']

export type NewDoc<T extends Meta> = Omit<T, keyof Meta>
