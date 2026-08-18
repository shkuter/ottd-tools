## 1. Сторы

- [x] 1.1 `state/__tests__/memoryStorage.ts` — in-memory `Storage`; хелпер `withStorage(store, json)`
- [x] 1.2 `consistStore.test.ts`: оживление по id; пропавшая машина отбрасывается; `partialize` пишет только `{id,count}`; `cargoLabel: null` сохраняется как null
- [x] 1.3 `settingsStore.test.ts`: старый объект без новых ключей → все ключи дефолтов присутствуют, сохранённые значения выигрывают
- [x] 1.4 `reset.test.ts`: `resetPersistedState()` чистит все зарегистрированные ключи

## 2. Данные

- [x] 2.1 `__tests__/dataset.test.ts`: `canCarryIn` — ваниль (только `default_cargo`), IH без FIRS (метки), полный рефит (классы, disallowed побеждает); `activeTrains/activeCargos` по флагам
- [x] 2.2 `__tests__/vanilla.test.ts`: адаптер машин (`capacities` из скаляра, `default_cargos`, длина 8, скорость), адаптер грузов (`initial_payment_by_economy.VANILLA`)

## 3. Проверка

- [x] 3.1 `npx vitest run` зелёный; найденные дефекты — отдельными коммитами
- [x] 3.2 CHANGELOG `[Unreleased]` — только если что-то починено
