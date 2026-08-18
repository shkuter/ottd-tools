## Why

Пайплайн держит один и тот же код в нескольких местах: бутстрап Iron Horse (`chdir` + подмена
`sys.argv` + `sys.path` + импорты) повторён в `extract_iron_horse.py` и
`extract_train_images.py`, а с оговоркой «порядок строк значим» это ещё и ловушка;
чтение JSON из `web/src/data` написано трижды (`validate.py`, `extract_opengfx2.py`,
`tests/test_known_values.py`); зависимости venv вбиты в `Makefile` без версий; пустая
`pipeline/schemas/` лежит без дела; `extract_train_images.py` глушит любые исключения и
завершается с кодом 0, даже если ни одной картинки не получилось.

## What Changes

- `common.py`: `bootstrap_iron_horse()` и `bootstrap_firs()` (единственное место, где живёт
  порядок «chdir → argv → sys.path»), `load_json(name)` для чтения `web/src/data/*.json`.
- Экстракторы и тесты переходят на них; локальные `load()`/`load_items()` удаляются.
- `pipeline/requirements.txt` с пином версий; `make venv` ставит из него.
- Пустая `pipeline/schemas/` удаляется (JSON-схем нет, а «задел» вводит в заблуждение;
  инварианты данных проверяет `validate.py`).
- `extract_train_images.py`: считает ошибки и завершается ненулевым кодом, если не удалось ни
  одной картинки; сообщения об ошибках — в stderr.
- Комментарии и docstrings в пайплайне — на английском (по правилу проекта), там, где файл
  и так переписывается.

## Non-goals

- Юнит-тесты на регулярки `extract_vanilla.py` и декодер `grf_sprites.py` — отдельный change.
- Перегенерация данных: `make data` после правки обязана дать пустой диф в `web/src/data`.

## Semver

**patch** — данные и числа не меняются.

## Источник истины

Не требуется — формулы и данные не трогаются; проверка — `make data` даёт пустой диф.

## Capabilities

Спеки не затрагиваются (`skip_specs: true`).

## Impact

`pipeline/common.py`, `extract_iron_horse.py`, `extract_train_images.py`, `extract_firs.py`,
`extract_opengfx2.py`, `validate.py`, `tests/test_known_values.py`, новый
`pipeline/requirements.txt`, `Makefile`.
