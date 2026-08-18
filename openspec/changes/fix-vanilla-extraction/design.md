## Context

`extract_vanilla.py` парсит `engines.h`/`cargo_const.h` регулярками. Макросы: `RVI(a…k)` —
`h` = `running_cost_class` (`RC_S/RC_D/RC_E/RC_W`), `k` = `EngineClass` (`S/D/E/N/V/A`);
`MK(bt, label, …)` — `label` это константа `CT_*`, значение которой (`"PASS"`) объявлено в
`cargo_type.h`.

## Goals / Non-Goals

**Goals:** данные ванили совпадают с игрой по классам и меткам; фронт не делает
`replace('CT_', '')`.
**Non-Goals:** см. proposal.

## Decisions

**Правка только в экстракторе, JSON перегенерируется** (`make data`), руками JSON не трогаем.

**Метки — из `cargo_type.h`, а не из таблицы соответствия в коде.** Так обновление игры не
потребует правки калькулятора; парсер — регулярка `CT_(\w+)\{"(.{4})"\}`.

**`engine_class` нормализуется в экстракторе** (`steam|diesel|electric|monorail|maglev`),
а маппинг в источник тяги Iron Horse (`STEAM|DIESEL|OHLE|…`) — в `web/src/vanilla.ts`: это
понятие калькулятора, а не игры.

**`CT_NONE` → `default_cargo: null`**, во фронте — `default_cargos: []`. В игре `CT_NONE ==
CT_PASSENGERS` с нулевой вместимостью; для калькулятора честнее «не возит ничего», иначе
локомотивы всплывают в списке пассажирских вагонов.

**Затрагиваемые модули engine/:** нет напрямую; `optimize.isPureElectric` начинает верно
работать для ванили благодаря `OHLE`. Настройки: `ironHorse`, `firs`, `allowElectric`
(параметр оптимизатора).

## Risks / Trade-offs

- **`cargos.ru.json` потеряет записи `CT_*`** → заменяются на настоящие метки; `locales.test`
  упадёт на любой пропущенной.
- **Иконки грузов ванили** именуются по `id` (`oil.png`), `id` не меняется — пути целы.
- **`make data` перегенерирует и Iron Horse/FIRS JSON** — диф должен быть только в
  `vanilla_*.json` и `meta.json`; проверить `git diff --stat`.
