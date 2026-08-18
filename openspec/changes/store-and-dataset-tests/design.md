## Context

Vitest запущен в окружении `node` (в `vite.config.ts` нет секции `test`), `localStorage`
там отсутствует. Zustand `persist` по умолчанию берёт `localStorage` через
`createJSONStorage(() => localStorage)` и молча отключает persist, если его нет — стор
создаётся, но `merge` не вызывается.

## Decisions

**Тестируем `merge`/`partialize` через `persist.setOptions({ storage })` + `rehydrate()`.**
Zustand отдаёт `useStore.persist.setOptions()` и `useStore.persist.rehydrate()`; подсовываем
in-memory `Storage` (обычный `Map`-обёртка), кладём туда JSON «как у старого пользователя» и
вызываем `rehydrate()`. Альтернатива — jsdom и настоящий localStorage — тяжелее и тянет
зависимость ради одного объекта.

**Сторы не рефакторим под тестируемость.** Задача — покрыть, что есть; вытаскивание
`merge`-функций в отдельные модули отложено, пока не понадобится по другой причине.

**Затрагиваемые модули engine/:** нет. Настройки: тест `settingsStore` проверяет, что все
ключи `DEFAULT_GAME_SETTINGS`/`DEFAULT_CALC_SETTINGS` присутствуют после `merge` со «старым»
объектом без части ключей.

## Risks / Trade-offs

- **`rehydrate()` асинхронный** → `await`, storage синхронный, так что фактически мгновенно.
- **Тесты датасета зависят от данных** → берут машины/грузы поиском по свойствам, а не по
  id (кроме эталонных вроде `COAL`), чтобы пережить обновление Iron Horse.

## Findings

Тесты адаптера ванили выявили два дефекта `pipeline/extract_vanilla.py` (см. change
`fix-vanilla-extraction`): перепутанные колонки `RVI` (класс содержания ↔ класс двигателя) и
метки ванильных грузов из имени константы вместо настоящих `CargoLabel`. Утверждения, которые на
них завязаны, вынесены в тот change; здесь остались тесты, верные на текущих данных.
