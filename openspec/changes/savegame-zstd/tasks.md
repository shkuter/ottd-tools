# savegame-zstd — tasks

## 1. Зависимость

- [x] 1.1 Добавить `fzstd` в `web/package.json` (`npm install fzstd`); проверить, что
  `npm ci` из чистого дерева проходит и `package-lock.json` закоммичен вместе с ним

## 2. Распаковка

- [x] 2.1 `savegame/decompress.ts`: тег `OTTS` в таблице `TAGS`, вариант `'zstd'` в
  `SavegameCompression`, ветка в `decompressSavegame`; распаковка — `await import('fzstd')`
  и `decompress()` рядом с `unxz`, ошибка декодера завёрнута в `SavegameFormatError`
  (обёртка общая для всех веток, вокруг `switch` — см. D4).
  Проверка: `npx tsc --noEmit` и `oxlint` чистые, ветка `switch` покрывает все варианты
  без `default`
- [x] 2.2 Тесты в `web/src/savegame/__tests__/decompress.test.ts` (файл русскоязычный —
  новые `it` тем же языком): zstd-поток собирается **потоковым** `zlib.createZstdCompress()`
  из Node, а не `zstdCompressSync` — синхронный знает размер заранее и пишет его в заголовок
  фрейма (Frame_Content_Size), тогда как `ZSTDSaveFilter` игры сжимает потоком
  (`ZSTD_e_continue` / `ZSTD_e_end`, без `setPledgedSrcSize`) и размера в заголовке не
  оставляет: декодер наращивает буфер сам, и проверять надо именно эту ветку. Поток
  распаковывается в исходные байты; обрезанный поток даёт `SavegameFormatError`, а не
  исключение библиотеки (`fzstd` кидает обычный `Error: unexpected EOF`); испорченный
  zlib-поток — тоже (обёртка общая, см. 2.1); неизвестный тег по-прежнему даёт ошибку с
  ключом `savegame.error.notASavegame`.
  Проверка: `cd web && npx vitest run decompress`

## 3. Проверка на живом файле

- [x] 3.1 **Ручной шаг** (нужен сейв игрока, агентом не выполняется): прогнать через импорт
  автосохранение партии JGRPP (`~/Documents/OpenTTD/save/`, файл с тегом `OTTS` — проверить
  `head -c 4`): предложенные настройки те же, что у ручного сохранения той же партии, признак
  патчпака включён
- [x] 3.2 Убедиться, что декодер не попал в основной чанк. Искать имя пакета в самом бандле
  бесполезно: Vite не именует чанки по пакету, а из ESM-сборки имя не попадает в код (у
  `xz-decompress` оно грепается только как литерал его UMD-обвязки). Проверка — по карте
  кода: `cd web && npm run build -- --sourcemap`, затем
  `grep -L "node_modules/fzstd" dist/assets/index-*.js.map` называет основной чанк (декодера
  в нём нет), а `grep -l "node_modules/fzstd" dist/assets/*.js.map` — тот чанк, куда он ушёл:
  это бандл воркера, куда Vite вносит и динамические импорты (см. D2)

## 4. Завершение

- [x] 4.1 Снять ограничение в change'е `xussr-dataset`: убрать zstd из его Non-goals и
  оговорку про ручной сейв из задачи 5.4, если он к этому моменту ещё не заархивирован.
  Проверка: `grep -rn -i zstd openspec/changes/xussr-dataset/` ничего не находит
- [x] 4.2 `CHANGELOG.md`, секция `[Unreleased]`: запись на английском в `### Added` —
  чтение сохранений, сжатых zstd (автосохранения JGRPP). Проверка: запись стоит под
  `### Added` внутри `[Unreleased]` и написана по-английски
- [x] 4.3 `make test` — зелёный; `make verify` проходит
