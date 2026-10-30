# Модель даних

Firestore: кожна колекція лежить у `users/{uid}/<колекція>`. Типи — `src/data/types.ts`.
Кожен документ має `id`, `owner_id`, `created_at`, `updated_at`. Дати — рядки `РРРР-ММ-ДД` (без часових поясів).

## Колекції

| Колекція | Що це | Ключові поля |
| --- | --- | --- |
| `academic_years` | навчальний рік | title, start_date, end_date, is_current (лише один поточний) |
| `periods` | семестр / чверть | academic_year_id, parent_id (чверть → семестр), kind, title, дати, position |
| `class_groups` | клас | academic_year_id, grade, letter, display_name («9-А») |
| `courses` | КТП предмета для паралелі | academic_year_id, subject, grade, hours_per_week (І семестр), hours_per_week_2 (ІІ семестр; немає — як у І), total_hours, program_ref, status |
| `course_classes` | клас, що йде за КТП | course_id, class_group_id, position (порядок колонок дат) |
| `topics` | тема (один рівень) | course_id, position, title, planned_hours |
| `lessons` | урок КТП | course_id, topic_id, period_id, position (у темі), number (наскрізний), title, lesson_type, homework, notes, extra |
| `lesson_schedules` | дата уроку для класу | id = `${lesson_id}_${class_group_id}`; course_id, planned_date, actual_date (не використовується), status, note |
| `bell_schedules` | дзвінки року | academic_year_id, first_start, lesson_minutes, `slots[]` {number, start, end, break_after} |
| `timetables` | тижневий розклад | academic_year_id, title, valid_from, valid_to |
| `timetable_entries` | клітинка розкладу | timetable_id, weekday, slot_number, class_group_id, course_id |
| `lesson_materials` | файл / посилання | course_id, lesson_id АБО topic_id (рівно одне), title, kind (file/link), drive_file_id, url, mime_type, size_bytes, position (у межах категорії), keep_offline, category |

`lesson_type`: `regular | practical | test | reserve` (старий `project` показується як звичайний урок). `status` дати: `planned | done | moved | cancelled`.
`category` матеріалу уроку: `slides | card | shelter | remote | test`, `null` — «Без типу». У старих записів поля немає:
при відкритті КТП чи «Сьогодні» вони один раз отримують `slides` (презентації) або `null` (`classifyLegacy` у `data/materials.ts`).
Матеріали теми (з `topic_id`) більше не показуються й не створюються.

## Ключові принципи

- Зміст уроку і ДЗ — один раз для паралелі (`lessons`), дати — окремо для класу (`lesson_schedules`).
- **Час уроку не зберігається.** Під час показу береться чинний на дату `timetable`, рядок для класу і дня тижня, а за `slot_number` — час із `bell_schedules.slots`. Зміна розкладу чи дзвінків одразу видна скрізь.
- Дзвінки — масивом у одному документі року, однакові для всіх днів.
- Новий розклад серед року — новий запис `timetables` з `valid_from`; старий лишається.
- Матеріали без класу: завжди спільні для паралелі.
- Firestore не має зовнішніх ключів: цілісність і перевірки — у коді застосунку.

## Правила

Жорсткі (застосунок не дає зберегти):
- номер уроку унікальний у курсі, без пропусків; «Резерв» і `extra` номера не мають;
- уроки йдуть у порядку тем;
- дати періоду в межах батька і навчального року; чверті семестру не перетинаються;
- одна дата на пару «урок × клас»; клас прив'язаний до курсу через `course_classes`;
- у тижневому розкладі пара «день × № уроку» — не більше одного класу.

М'які (лише попередження): сума уроків теми ≠ planned_hours; уроків ≠ total_hours.
