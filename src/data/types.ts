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
  // Додатковий урок лише для частини класів (у зразку — «*»): без наскрізного номера.
  extra?: boolean
}

export type LessonStatus = 'planned' | 'done' | 'moved' | 'cancelled'

// Дата уроку для класу. id документа = `${lesson_id}_${class_group_id}`.
export type LessonSchedule = Meta & {
  course_id: string
  lesson_id: string
  class_group_id: string
  planned_date: ISODate | null
  actual_date: ISODate | null
  status: LessonStatus
  note: string
}

// Розклад дзвінків року: однаковий для всіх днів. Час уроку береться за номером уроку в дні.
export type BellSlot = {
  number: number
  start: string // «08:30»
  end: string
  break_after: number // хвилин перерви після уроку
}

export type BellSchedule = Meta & {
  academic_year_id: string
  first_start: string
  lesson_minutes: number
  slots: BellSlot[]
}

// Тижневий шаблон розкладу; щотижня однаковий. Новий розклад серед року — новий запис.
export type Timetable = Meta & {
  academic_year_id: string
  title: string
  valid_from: ISODate
  valid_to: ISODate
}

// Клітинка шаблону: день тижня × номер уроку → клас і КТП.
export type TimetableEntry = Meta & {
  timetable_id: string
  weekday: number // 1 = пн
  slot_number: number
  class_group_id: string
  course_id: string
}

export type MaterialKind = 'file' | 'link'

// Тип файлу уроку («поличка»): презентація, інструкційна картка, завдання для укриття, дистанційне, тест.
export type MaterialCategory = 'slides' | 'card' | 'shelter' | 'remote' | 'test'

// Матеріал до уроку або до всієї теми (заповнене рівно одне з lesson_id / topic_id).
// Спільний для всіх класів паралелі; сам файл лежить на Google Диску.
export type LessonMaterial = Meta & {
  course_id: string
  lesson_id: string | null
  topic_id: string | null
  title: string
  kind: MaterialKind
  drive_file_id: string | null
  url: string | null
  mime_type: string | null
  size_bytes: number | null
  // Порядок усередині категорії (для матеріалів теми — у списку теми).
  position: number
  keep_offline: boolean
  // Лише в матеріалів уроку; null — «Без типу». Старі записи без поля класифікуються один раз.
  category?: MaterialCategory | null
}

export type Collections = {
  academic_years: AcademicYear
  periods: Period
  class_groups: ClassGroup
  courses: Course
  course_classes: CourseClass
  topics: Topic
  lessons: Lesson
  lesson_schedules: LessonSchedule
  bell_schedules: BellSchedule
  timetables: Timetable
  timetable_entries: TimetableEntry
  lesson_materials: LessonMaterial
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
  'lesson_schedules',
  'bell_schedules',
  'timetables',
  'timetable_entries',
  'lesson_materials',
]

export type NewDoc<T extends Meta> = Omit<T, keyof Meta>
