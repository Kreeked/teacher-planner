# Архітектура і сервіси

## Стек

| Шар | Що |
| --- | --- |
| Застосунок | React 19 + TypeScript + Vite, PWA (`vite-plugin-pwa`, autoUpdate) |
| Маршрутизація | React Router, `HashRouter` (бо GitHub Pages) |
| Дані | Cloud Firestore з `persistentLocalCache` + `persistentMultipleTabManager` |
| Вхід | Firebase Authentication, Google |
| Файли | Google Drive API (scope `drive.file`) + Google Picker, токен через Google Identity Services |
| Розбір .docx | `fflate` у браузері (файли не йдуть на сервер) |
| Перетягування | `@dnd-kit` |
| Іконки | `lucide-react` |
| Тести / лінтер | `vitest`, `oxlint` |
| Хостинг | GitHub Pages через GitHub Actions |

## Сервіси й доступи

- **GitHub:** `Kreeked/teacher-planner` (публічний), основна гілка `main`.
- **Firebase:** проєкт `teacher-planner-49257`, тариф Spark. Конфіг (не секретний) — `src/lib/firebase.ts`.
  Authorized domains містить `kreeked.github.io`.
- **Google Cloud** (той самий проєкт): увімкнені Drive API і Picker API; OAuth Client ID — у `src/lib/drive.ts`;
  дозволений origin `https://kreeked.github.io`.
- **Правила Firestore:** `firestore.rules` — доступ лише власнику до `users/{uid}/…`. Публікуються вручну в консолі Firebase.
- Секретів у репозиторії немає й не потрібно.

## Структура `src/`

| Папка | Вміст |
| --- | --- |
| `data/` | `types.ts` (усі типи й список колекцій), `db.ts` (доступ до Firestore, хуки), логіка: `ktp.ts`, `day.ts`, `year.ts`, `schedule.ts`, `timetable.ts`, `materials.ts` (зокрема типи файлів уроку), `offline.ts`, `backup.ts`; поруч `*.test.ts` |
| `import/` | `docx.ts`, `ktpParser.ts`, `applyImport.ts` (імпорт КТП) |
| `lib/` | `firebase.ts`, `drive.ts`, `offlineFiles.ts`, `useOfflinePlan.ts`, `useOnline.ts`, `confirm.ts`, `saved.ts`, `drag.ts`, `dates.ts`, `useClassifyLegacy.ts` |
| `components/` | `Dialog`, `Confirm`, `Menu`, `Sortable`, `DatePicker`, `InlineText`, `RangeRow`, `Saved` |
| `pages/` | `TodayPage`, `schedule/`, `ktp/` (зокрема `Materials` — вікно й полички), `year/`, `settings/`, `LoginPage`, `SettingsPage` |
| `layout/` | `AppLayout`, `nav.ts` (меню), `MonthCalendar` |
| `index.css` | усі стилі, токени дизайну як CSS-змінні |

## Маршрути

`/` Сьогодні · `/schedule` · `/ktp` · `/ktp/year` · `/ktp/:courseId` · `/settings`

## Офлайн

- Оболонка застосунку кешується service worker'ом (Workbox); шрифт Onest — runtime-кеш.
- Дані — локальний кеш Firestore. Перший вхід на пристрої потребує інтернету.
- Файли до уроків — Cache Storage `planner-files`:
  - автоматично — файли уроків на найближчі `OFFLINE_DAYS = 7` днів і з `keep_offline`;
  - ліміт `OFFLINE_LIMIT = 1 ГБ` на пристрій;
  - Google Документи/Таблиці/Презентації зберігаються як PDF;
  - токен Диска тримається в `localStorage` до 1 год для тихої синхронізації;
  - перед відкриттям файлу — запит до `gstatic.com/generate_204`, бо `navigator.onLine` на ПК часто бреше; без зв'язку відкривається збережена копія.
- Налаштування → Офлайн-файли: зайняте місце, список, видалення окремого файлу, «очистити минулі», «очистити все».

## Резервна копія

Налаштування → «Зберегти копію»: JSON з усіма колекціями зі списку `COLLECTION_NAMES` (`data/types.ts`).
Нова колекція має потрапити в цей список.
