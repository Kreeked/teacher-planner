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

export type CourseStatus = 'draft' | 'approved' | 'archived'

export type Course = Meta & {
  academic_year_id: string
  subject: string
  grade: number
  hours_per_week: number
  total_hours: number
  program_ref: string
  status: CourseStatus
}

export type CourseClass = Meta & {
  course_id: string
  class_group_id: string
  // Дні тижня уроків (1 = пн) для автодат — тимчасово, до модуля «Розклад».
  weekdays: number[]
  position: number
}

export type Topic = Meta & {
  course_id: string
  position: number
  title: string
  planned_hours: number
}

export type LessonType = 'regular' | 'practical' | 'test' | 'project' | 'reserve'

export type Lesson = Meta & {
  course_id: string
  topic_id: string
  period_id: string | null
  // Порядок уроку всередині теми; наскрізний номер у курсі — number.
  position: number
  number: number
  title: string
  lesson_type: LessonType
  homework: string
  notes: string
  // Очікувані результати навчання уроку, у порядку показу (id з learning_outcomes).
  outcome_ids?: string[]
}

export type LearningOutcome = Meta & {
  course_id: string
  text: string
  position: number
}

export type Collections = {
  academic_years: AcademicYear
  periods: Period
  class_groups: ClassGroup
  courses: Course
  course_classes: CourseClass
  topics: Topic
  lessons: Lesson
  learning_outcomes: LearningOutcome
}

export type CollectionName = keyof Collections

// Усі колекції користувача: з цього списку будується резервна копія.
export const COLLECTION_NAMES: CollectionName[] = [
  'academic_years',
  'periods',
  'class_groups',
  'courses',
  'course_classes',
  'topics',
  'lessons',
  'learning_outcomes',
]

export type NewDoc<T extends Meta> = Omit<T, keyof Meta>
