## Why

Две категории кода живут без тестов, хотя именно они ломаются тише всего:

- **Миграция сохранённого состояния.** `consistStore` хранит в localStorage только
  `{id, count}` и «оживляет» `Train` из каталога при загрузке; `settingsStore` доливает в
  старый сохранённый объект новые поля настроек. Если после обновления данных машина
  пропала из каталога или в `GameSettings` появилось поле — пользователь либо получает
  пустой состав, либо `undefined` в расчёте. Ни один тест сейчас этого не проверяет.
- **Выбор набора и рефит.** `dataset.canCarryIn` содержит три ветки (ваниль / Iron Horse без
  FIRS / полный NewGRF-рефит по классам), `vanilla.ts` адаптирует ванильные машины и грузы к
  общему типу. Покрыто только косвенно через `settings-effect`.

Тесты сторов и датасета — страховка на будущие changes, где меняются данные и настройки.

## What Changes

- Тесты `merge`/`partialize` для `consistStore` и `settingsStore` (jsdom не нужен: zustand
  persist работает с любым `Storage`-подобным объектом; передаём in-memory storage).
- Тесты `canCarryIn` по трём веткам, `canCarry` по классам allowed/disallowed, адаптеров
  `vanilla.ts` (единицы, скорость, `capacity`→`capacities`, `default_cargo`→`default_cargos`).
- Тест `resetPersistedState()` — после вызова в storage не остаётся ни одного ключа сторов.
- Кода приложения не трогаем, кроме случаев, когда тест выявит дефект (тогда — фикс отдельным
  коммитом с записью в CHANGELOG).

## Non-goals

- Тесты компонентов и рендера.
- Тесты пайплайна (Python) — отдельный change про `pipeline/`.

## Semver

**patch** — только тесты; если найдётся дефект, разряд решается по нему.

## Источник истины

Не требуется — формулы не трогаются.

## Capabilities

Спеки не затрагиваются (`skip_specs: true`).

## Impact

Новые файлы: `web/src/state/__tests__/consistStore.test.ts`, `settingsStore.test.ts`,
`reset.test.ts`; `web/src/__tests__/dataset.test.ts`, `vanilla.test.ts`.
