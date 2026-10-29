# Розробка

## Команди (Node 22+)

```bash
npm install
npm run dev          # http://localhost:5173
npm run lint         # oxlint
npm test             # vitest
npm run build        # tsc -b && vite build
npm run emulators    # локальні Auth + Firestore (потрібна Java)
npm run dev:emu      # застосунок проти емуляторів; вхід створює тестового користувача
```

## Перевірка в браузері

- Справжні дані не чіпати: для скриншотів і ручної перевірки — емулятори + `npm run dev:emu`.
- Тестові дані можна засіяти з консолі браузера через `import('/src/data/db.ts')`.
- Перевіряти і ПК-ширину, і телефон (~390 px).

## Процес змін

1. Гілка від `main`, зміни, `npm run lint && npm test && npm run build` локально.
2. Pull request у `Kreeked/teacher-planner`. CI (`.github/workflows/ci.yml`): `npm ci → lint → test → build`.
3. Власник сам переглядає і зливає PR.
4. Після злиття `deploy.yml` збирає з `BASE_PATH=/teacher-planner/` і публікує на GitHub Pages; застосунок у користувача оновлюється сам.

## Домовленості в коді

- Тексти інтерфейсу, коміти, описи PR і коментарі в коді — українською.
- Коментарі короткі й пояснюють «навіщо», як у наявному коді.
- Логіка й обчислення — у `src/data/*` з тестами поруч (`*.test.ts`); сторінки — у `src/pages/*`.
- Нова колекція: тип у `types.ts`, назва в `Collections` і `COLLECTION_NAMES` (щоб потрапила в резервну копію).
- Нові дати — рядки `РРРР-ММ-ДД`, утиліти в `lib/dates.ts`.
- Перевірки цілісності даних — у коді (Firestore без зовнішніх ключів).

## Ручні кроки, яких код не зробить

Власник не розробник — такі кроки описувати покроково, з посиланням на потрібну консоль:
- зміни `firestore.rules` → опублікувати в Firebase Console → Firestore → Rules;
- новий домен → Firebase Auth → Authorized domains, і origin в OAuth-клієнті Google Cloud;
- нові Google API → увімкнути в Google Cloud Console проєкту `teacher-planner-49257`.
