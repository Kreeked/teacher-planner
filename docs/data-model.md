# Модель даних

Firestore: кожна колекція лежить у `users/{uid}/<колекція>`. Типи — `src/data/types.ts`.
Кожен документ має `id`, `owner_id`, `created_at`, `updated_at`. Дати — рядки `РРРР-ММ-ДД` (без часових поясів).

## Колекції

| Колекція | Що це | Ключові поля |
| --- | --- | --- |
| `academic_years` | навчальний рік | title, start_date, end_date. Поточний не зберігається: це рік, у чиїх межах сьогодні; між роками — найближчий наступний, після останнього — останній (`pickCurrentYear`) |
| `periods` | семестр / чверть | academic_year_id, parent_id (чверть → семестр), kind, title, дати, position |
| `class_groups` | клас | academic_year_id, grade, letter, display_name («9-А») |
| `courses` | КТП предмета для паралелі | academic_year_id, subject, grade, hours_per_week (І семестр), hours_per_week_2 (ІІ семестр; немає — як у І), total_hours, program_ref, status |
| `course_classes` | клас, що йде за КТП | course_id, class_group_id, position (порядок колонок дат) |
| `topics` | тема (один рівень) | course_id, position, title, planned_hours |
| `lessons` | урок КТП | course_id, topic_id, period_id, position (у темі), number (наскрізний), title, lesson_type, homework, notes, extra |
| `lesson_schedules` | дата уроку для класу | id = `${lesson_id}_${class_group_id}`; course_id, planned_date, actual_date (не використовується), status, note |
| `bell_schedules` | дзвінки року, один запис на рік | academic_year_id, `slots[]` — перша зміна, `second_shift[]` — друга (немає, доки не задано); слот {number, start, end, break_after}. Час кожного уроку правиться вручну, перерва — проміжок до наступного уроку |
| `timetables` | тижневий розклад | academic_year_id, title, valid_from, valid_to. Сторінка року веде один розклад на весь рік; старі записи з іншими датами (з часів версій) лишаються й діють у свої дати |
| `timetable_entries` | клітинка розкладу | timetable_id, weekday, slot_number, shift (1 або 2; немає — перша), class_group_id, course_id |
| `lesson_materials` | файл / посилання | course_id, lesson_id АБО topic_id (рівно одне), title, kind (file/link), drive_file_id, url, mime_type, size_bytes, position (у межах категорії), keep_offline, category |

`lesson_type`: `regular | practical | test | reserve` (старий `project` показується як звичайний урок). `status` дати: `planned | moved | cancelled` (старе значення `done` більше не використовується й ніде не показується).
`category` матеріалу уроку: `slides | card | shelter | remote | test`, `null` — «Без типу». У старих записів поля немає:
при відкритті КТП чи «Сьогодні» вони один раз отримують `slides` (презентації) або `null` (`classifyLegacy` у `data/materials.ts`).
Матеріали теми (з `topic_id`) більше не показуються й не створюються.

## Ключові принципи

- Зміст уроку і ДЗ — один раз для паралелі (`lessons`), дати — окремо для класу (`lesson_schedules`).
- **Час уроку не зберігається.** Під час показу береться чинний на дату `timetable`, рядок для класу і дня тижня, а за `shift` і `slot_number` — час із `bell_schedules` (`slots` чи `second_shift`). Зміна розкладу чи дзвінків одразу видна скрізь.
- Дзвінки — масивами в одному документі року (по масиву на зміну), однакові для всіх днів.
- Видалення уроку в дзвінках прибирає його клітинки в розкладі й зсуває номери наступних; видалення класу чи року прибирає й їхні клітинки, дзвінки та розклад.
- Матеріали без класу: завжди спільні для паралелі.
- Firestore не має зовнішніх ключів: цілісність і перевірки — у коді застосунку.

## Правила

Жорсткі (застосунок не дає зберегти):
- номер уроку унікальний у курсі, без пропусків; «Резерв» і `extra` номера не мають;
- уроки йдуть у порядку тем;
- дати періоду в межах батька і навчального року; чверті семестру не перетинаються;
- одна дата на пару «урок × клас»; клас прив'язаний до курсу через `course_classes`;
- у тижневому розкладі пара «день × зміна × № уроку» — не більше одного класу;
- дзвінки: уроки йдуть по черзі й не перетинаються.

М'які (лише попередження): сума уроків теми ≠ planned_hours; уроків ≠ total_hours.
