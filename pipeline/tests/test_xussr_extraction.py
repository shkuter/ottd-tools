"""Регрессионные тесты xussr_trains.json: извлечение против известных свойств набора.

Эталоны сняты с исходников xUSSR на пине XUSSR_REF (значения формул при параметрах
по умолчанию); сверка с меню покупки живой партии — test 6.1 плана xussr-dataset.
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from common import load_json  # noqa: E402
from extract_xussr import display_kmh  # noqa: E402


class XussrKnownValues(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        payload = load_json("xussr_trains.json")
        cls.meta = payload["meta"]
        cls.items = payload["items"]
        cls.by_id = {t["id"]: t for t in payload["items"]}
        cls.railtypes = {rt["label"]: rt for rt in cls.meta["railtypes"]}

    # --- машины (1.4) ---

    def test_chs2(self):
        t = self.by_id["xussr_chs2_25e0"]
        self.assertEqual(t["name"], 'ChS2 / 25E0 "Cheburashka" (Electric)')
        self.assertEqual(t["kind"], "engine")
        self.assertEqual(t["intro_year"], 1957)  # 1958 минус delta_age набора
        self.assertEqual(t["cost_factor"], 61)
        self.assertEqual(t["power_hp"], 3975)  # int(4030 * 9865 / 10000)
        self.assertEqual(t["weight_t"], 120)
        self.assertEqual(t["speed_internal"], 140)
        self.assertEqual(t["running_cost_base"], "RUNNING_COST_ELECTRIC")
        # ветка «только построен»: сумма шести статей switch'а running cost (1.6)
        self.assertEqual(t["running_cost_factor"], 440)

    def test_steam_a_against_the_buy_menu(self):
        """Паровоз А, сверен со скриншотом меню покупки партии пользователя (1872).

        Игра показывает: скорость 82 км/ч, масса 51 т, тяговое усилие 20 кН, ёмкость
        отсутствует, срок службы 25 лет, выпуск 1861–1872. Два числа на экране выглядят
        иначе и оба объясняются не данными: мощность игра показывает в метрических л.с.
        (246 × 4153 / 4096 = 249, strings.cpp), а «разработан в 1861» — это дата GRF,
        сдвинутая вперёд включённой у игрока рандомизацией дат появления JGRPP.
        """
        t = self.by_id["xussr_steam_a"]
        self.assertEqual(t["name"], "A (4-2-0) (Steam)")
        self.assertEqual(t["speed_internal"], 82)  # внутренняя единица ~= км/ч
        self.assertEqual(t["weight_t"], 51)
        self.assertEqual(round(t["te_coefficient"] * t["weight_t"] * 9.8), 20)
        self.assertEqual(t["capacities"][2], 0)
        self.assertEqual(t["vehicle_life"], 25)
        self.assertEqual(t["intro_year"], 1860)
        self.assertEqual(t["model_life"], 12)  # 1861..1872 в меню покупки
        self.assertEqual(t["power_hp"], 246)
        self.assertEqual(round(t["power_hp"] * 4153 / 4096), 249)

    def test_engines_carry_nothing(self):
        """Ёмкость берётся из меню покупки, а не из свойства.

        Набор ставит локомотивам `cargo_capacity: 1`, чтобы игра сочла их способными
        что-то везти, а в меню покупки показывает 0 — каллбеком. Свойство здесь не ответ.
        """
        self.assertEqual(self.by_id["xussr_chs2_25e0"]["capacities"], [0] * 5)
        self.assertEqual(self.by_id["xussr_steam_a"]["capacities"], [0] * 5)

    # Эталоны меню покупки партии на девяти наборах 0.8.1 (2000 г., скриншоты 29.08.2026).
    # Мощность игра показывает в метрических л.с., данные держат имперские — отсюда
    # множитель 4153/4096 (strings.cpp). Скорость внутренней единицы совпадает с км/ч.
    BUY_MENU = {
        # id: (масса т, км/ч, л.с. метрических, мест)
        "xussr_tgv_a": (444, 301, 11966, 485),
        "xussr_crh380a": (409, 382, 10878, 489),
        "xussr_tera1": (180, 115, 3209, 0),
        "xussr_chme3t": (123, 95, 1150, 0),
        "xussr_ach2": (59, 120, 850, 67),
        "xussr_tem7a_type1988": (180, 100, 1360, 0),
        "xussr_ra1_pre": (32, 100, 337, 62),
        "xussr_tgm23d": (45, 60, 399, 0),
        "xussr_tgm6d": (90, 80, 790, 0),
        "xussr_ed9t_h": (44, 130, 0, 80),
    }

    def test_buy_menu_values(self):
        for train_id, (weight, kmh, power, capacity) in self.BUY_MENU.items():
            with self.subTest(train=train_id):
                t = self.by_id[train_id]
                self.assertEqual(t["weight_t"], weight)
                self.assertEqual(display_kmh(t["speed_internal"]), kmh)
                self.assertEqual(round(t["power_hp"] * 4153 / 4096), power)
                self.assertEqual(t["capacities"][2], capacity)

    def test_articulated_sums(self):
        """Меню покупки показывает сочленённую машину целиком, а не её голову.

        У TGV Atlantique 24 секции: 485 мест и 444 т — суммы по ним. Голова одна несёт
        369 мест, и данные, оставшиеся при ней, разошлись бы с игрой на треть состава.
        """
        tgv = self.by_id["xussr_tgv_a"]
        self.assertGreater(len(tgv["units"]), 1)
        self.assertEqual(tgv["capacities"][2], sum(u["capacities"][2] for u in tgv["units"]))
        self.assertEqual(tgv["weight_t"], sum(u["weight_t"] for u in tgv["units"]))

    def test_capacity_by_cargo_sums_the_articulated_sections(self):
        """Таблица по грузу описывает машину целиком, как и `capacities`.

        У TGV Atlantique голова несёт 369 мест, прицепная секция — 116, меню покупки
        показывает 485. Расчёт читает `capacity_by_cargo` в приоритет, поэтому таблица,
        оставшаяся при голове, увела бы доход рейса и подбор на треть состава.
        """
        for train_id, cargo in (("xussr_tgv_a", "PASS"), ("xussr_ice1", "PASS")):
            with self.subTest(train=train_id):
                train = self.by_id[train_id]
                self.assertGreater(len(train["units"]), 1)
                # значение — список по секциям: складывает их расчёт, здесь сверяется сумма
                sections = train["capacity_by_cargo"][cargo]
                self.assertGreater(len(sections), 1)
                self.assertEqual(sum(sections), train["capacities"][2])

    def test_section_cargo_is_its_own(self):
        """Груз секции берётся у неё, а не у головы.

        У почтового TGV голова возит пассажиров, прицепные — почту и товары. Спросив
        секцию про PASS, экстрактор получил бы ноль и записал бы машину, которая не
        везёт ничего (в игре она возит почту восемью вагонами).
        """
        laposte = self.by_id["xussr_tgv_laposte"]["capacity_by_cargo"]
        self.assertIn("MAIL", laposte)
        # восемь почтовых секций, каждая своей парой массовой формулы
        self.assertEqual(len(laposte["MAIL"]), 8)
        for section in laposte["MAIL"]:
            self.assertEqual(len(section), 2)

    def test_wagon_capacity_against_the_buy_menu(self):
        """«64 тонны угля», «25 тонн кокса», «52 тонны продуктов» — числа из игры.

        Вагоны названы в меню грузоподъёмностью и объёмом, и формула набора выводит из
        них место под конкретный груз: пара [тоннаж×16, 2×объём×плотность], делённая на
        вес единицы груза (16 у угля и продуктов, у кокса тоже 16).
        """
        for train_id, cargo, weight_16ths, expected in (
            ("xussr_gondola_22_4024", "COAL", 16, 64),
            ("xussr_dumpcar_33_677", "COKE", 16, 25),
            ("xussr_hopper_17_486", "FOOD", 16, 52),
        ):
            with self.subTest(train=train_id):
                # вагон — одна секция, поэтому список из одной пары
                (section,) = self.by_id[train_id]["capacity_by_cargo"][cargo]
                tonnage, volume = section
                capacity = min(tonnage // weight_16ths, (volume // weight_16ths) // 125)
                self.assertEqual(capacity, expected)
        # грузоподъёмность и объём — те же, что игра пишет в описании вагона
        gondola = self.by_id["xussr_gondola_22_4024"]["capacity_by_cargo"]
        self.assertEqual(gondola["COAL"][0][0] // 16, 115)  # «Грузоподъёмность: 115 т»
        self.assertEqual(gondola["COAL"][0][1], 2 * 76 * 850)  # «Объём: 76 м³», уголь 850 кг/м³

    def test_name_with_parameters(self):
        # имена вагонов набор собирает строкой с параметрами: {UNSIGNED_WORD}-{UNSIGNED_WORD}
        self.assertEqual(
            self.by_id["xussr_gondola_22_4024"]["name"], "22-4024 Gondola for iron ore"
        )

    def test_unique_ids_across_sets(self):
        ids = [t["id"] for t in self.items]
        self.assertEqual(len(ids), len(set(ids)))
        other = {t["id"] for t in load_json("trains.json")["items"]}
        other |= {t["id"] for t in load_json("vanilla_trains.json")["items"]}
        self.assertFalse(set(ids) & other)

    def test_every_item_accounted_for(self):
        # валидатор извлечения: пропуск — только поимённо и с причиной (1.3)
        for skip in self.meta["skipped"]:
            self.assertTrue(skip["reason"], skip)
        reasons = {s["reason"] for s in self.meta["skipped"]}
        self.assertLessEqual(reasons, {
            "articulated section, counted in its head",
            "spacer section",
            "variant group header",
            "not buildable at default parameters",
        })

    # --- мощность по родам тока (1.5) ---

    def test_dual_system_power(self):
        # TGV Réseau: полная мощность под 25 кВ AC, меньшая под 3 кВ DC — как в игре
        t = self.by_id["xussr_tgv_r"]
        p = t["power_by_source"]
        self.assertEqual(p["AC25"], 11964)
        self.assertEqual(p["DC3"], 5003)
        self.assertNotEqual(p["AC25"], p["DC3"])

    def test_dc_only_engine_gets_stub_elsewhere(self):
        # ВЛ19: 2413 л.с. на 3 кВ DC, заглушка набора (5 л.с.) на прочих путях
        p = self.by_id["xussr_vl19"]["power_by_source"]
        self.assertEqual(p["DC3"], 2413)
        self.assertEqual(p["AC25"], 5)
        self.assertEqual(p["SELF"], 5)

    def test_lastmile_diesel(self):
        # 2ЭВ120: электровоз с вспомогательным дизелем — мощность и без контактной сети
        p = self.by_id["xussr_2ev120"]["power_by_source"]
        self.assertEqual(p["AC25"], p["DC3"])
        self.assertEqual(p["SELF"], 671)

    def test_speed_differs_by_current_system(self):
        """Набор ветвит не только мощность: у TGV Atlantique пределы 300 и 250 км/ч.

        `engine_speed(tgv_a_AC, 300)` против `engine_speed(tgv_a_DC, 250)` — на линии
        постоянного тока игра держит машину на 250, и калькулятор обязан так же.
        """
        t = self.by_id["xussr_tgv_a"]
        speeds = t["speed_by_source"]
        self.assertEqual(speeds["AC25"], 300)
        self.assertEqual(speeds["DC3"], 250)
        self.assertEqual(speeds["DC1_5"], 250)
        # без знакомого рода тока остаётся собственный предел машины
        self.assertEqual(speeds["SELF"], 250)

    def test_speed_by_source_only_where_the_set_branches(self):
        # машина без веток описывается свойством: лишнего поля у неё нет
        self.assertIsNone(self.by_id["xussr_chs2_25e0"]["speed_by_source"])
        branching = [t for t in self.items if t["speed_by_source"]]
        self.assertGreater(len(branching), 0)
        # и всюду, где ветки есть, они реально расходятся
        for t in branching:
            with self.subTest(train=t["id"]):
                self.assertGreater(len(set(t["speed_by_source"].values())), 1)

    # --- вместимость по грузу (1.7) ---

    def test_gondola_capacity_differs_by_cargo(self):
        # полувагон 22-4024: 115 т, 76 м³; плотности набора: уголь 850, кокс 500.
        # Пара [X, Y] — компоненты формулы min(X/uw, Y/uw/125) до деления на вес
        # единицы груза: X = т × 16, Y = 2 × м³ × плотность
        caps = self.by_id["xussr_gondola_22_4024"]["capacity_by_cargo"]
        self.assertEqual(caps["COAL"], [[115 * 16, 2 * 76 * 850]])
        self.assertEqual(caps["COKE"], [[115 * 16, 2 * 76 * 500]])
        # при весе единицы 1 т (uw = 16): уголь упирается в тоннаж раньше кокса
        for label, expected in (("COAL", 64), ("COKE", 38)):
            ((x, y),) = caps[label]
            self.assertEqual(min(x // 16, y // 16 // 125), expected)

    def test_cargo_without_capacity_is_not_carried(self):
        caps = self.by_id["xussr_gondola_22_4024"]["capacity_by_cargo"]
        # груз без записи в таблице вместимостей вагон не везёт — это и есть его рефит,
        # второго списка тех же меток в данных нет
        self.assertNotIn("GOOD", caps)
        self.assertIn("COAL", caps)
        self.assertEqual(self.by_id["xussr_gondola_22_4024"]["refit"]["labels_allowed"], [])

    # --- таблица путей (1.8) ---

    def test_rla1_speed_limit(self):
        self.assertEqual(self.railtypes["RLA1"]["speed_limit_internal"], 100)
        self.assertFalse(self.railtypes["RLA1"]["hidden"])
        self.assertEqual(self.railtypes["RLA1"]["power_source"], [])

    def test_vanilla_labels_hidden(self):
        self.assertTrue(self.railtypes["RAIL"]["hidden"])
        self.assertTrue(self.railtypes["ELRL"]["hidden"])

    def test_current_sources(self):
        self.assertEqual(self.railtypes["ERA1"]["power_source"], ["AC25"])
        self.assertEqual(self.railtypes["ERD1"]["power_source"], ["DC3"])
        self.assertEqual(self.railtypes["ERa2"]["power_source"], ["AC15"])
        self.assertEqual(self.railtypes["ERd1"]["power_source"], ["DC1_5"])

    def test_multi_system_track_is_selectable(self):
        # ER2S — видимая двухсистемная магистраль: оба рода тока, в порядке веток набора
        er2s = self.railtypes["ER2S"]
        self.assertFalse(er2s["hidden"])
        self.assertEqual(er2s["power_source"], ["AC25", "DC3"])

    def test_no_speed_limit_is_zero(self):
        self.assertEqual(self.railtypes["ERA4"]["speed_limit_internal"], 0)

    def test_masks_are_normalised(self):
        known = set(self.railtypes)
        for rt in self.railtypes.values():
            self.assertIn(rt["label"], rt["powered"])
            self.assertLessEqual(set(rt["powered"]), known)
            self.assertLessEqual(set(rt["powered"]), set(rt["compatible"]))

    # --- meta (1.9) ---

    def test_basecost_shifts(self):
        self.assertEqual(self.meta["basecost_shifts"], {
            "build_engine": 1,
            "build_wagon": 3,
            "running_steam": 0,
            "running_diesel": 0,
            "running_electric": 0,
            "running_roadveh": 0,
        })

    def test_new_ratios_matches_the_reference_party(self):
        """`enable_new_ratios` меняет рейтинг станций, а не числа машин.

        Проверено на партии, с которой снимаются эталоны 6.1: все её GRF 0.8.1 несут
        параметр 0 = 192, то есть биты icons(6) и long names(7) — а бит 5
        (`enable_new_ratios`) сброшен, как и по умолчанию у набора. Данные извлечены при
        тех же значениях, поэтому эталоны сверяются с партией напрямую.
        """
        for grf in ("steam", "diesel", "electric", "dmu", "emu", "wagons", "cars", "addon"):
            with self.subTest(grf=grf):
                params = self.meta["grf_parameters"][grf]
                # аддон путей и часть файлов параметра рейтинга не объявляют вовсе
                self.assertEqual(params.get("enable_new_ratios", 0), 0)
                self.assertEqual(params["enable_icons"], 1)
                self.assertEqual(params["enable_long_names"], 1)

    def test_default_parameters_recorded(self):
        electric = self.meta["grf_parameters"]["electric"]
        self.assertEqual(electric["new_costs"], 0)
        self.assertEqual(electric["enable_new_ratios"], 0)
        rails = self.meta["grf_parameters"]["rails"]
        self.assertEqual(rails["currents_mode"], 1)
        self.assertEqual(rails["speedlimit_mode"], 1)

    def test_grfids(self):
        self.assertEqual(self.meta["grfids"]["electric"], "4d656fb4")
        self.assertEqual(self.meta["grfids"]["addon"], "4d656fb0")

    # --- имена (2.2) ---

    def test_names_match_the_buy_menu(self):
        """Имя — то, что игрок читает в меню покупки, а не короткая метка модели.

        Набор объявляет машину коротким именем и следом переобъявляет длинным, если
        включён `enable_long_names` — его дефолт 1, и в партиях он тоже включён.
        Каталог обязан совпадать с игрой: по короткому «Fᴾ» машину там не найти.
        """
        self.assertEqual(
            self.by_id["xussr_electric_fp"]["name"], 'Fᴾ "French" for passengers (Electric)'
        )
        self.assertEqual(
            self.by_id["xussr_vl80t"]["name"], 'VL80ᵀ-702 "Vylo" (Electric)'
        )
        # длинное имя приходит отдельным объявлением поверх короткого
        self.assertTrue(
            self.by_id["xussr_vl80t"]["string_id"].startswith("STR_LONGNAME_")
        )

    # --- серии вариантов ---

    def test_series_shares_one_head(self):
        """Четыре типа Тᴷ — одна серия, и она стареет по своей голове.

        Голова серии сама не покупается: набор держит её ради строки меню, поэтому в
        каталоге её нет, а игра считает такую машину введённой с первого дня партии.
        """
        types = [f"xussr_tk030_type{y}" for y in (1870, 1873, 1875, 1892)]
        keys = {self.by_id[i]["variant_group"] for i in types}
        self.assertEqual(keys, {"steam:group_steam_tk030"})
        self.assertNotIn("xussr_group_steam_tk030", self.by_id)

        head = self.meta["variant_groups"]["steam:group_steam_tk030"]
        self.assertFalse(head["buyable"])
        self.assertEqual(head["intro_year"], 1873)

    def test_group_without_reliability_syncing(self):
        """`vehicle_group_pre` даёт группу без синхронизации — такая машина стареет сама.

        Отличать обязательно: `CalcEngineReliability` идёт к голове только по флагу, и без
        этой проверки ЧМЭ3 сняли бы с продажи по возрасту чужой серии. В данных это видно
        по пустой голове: поле называет ту машину, по которой считается возраст.
        """
        self.assertIsNone(self.by_id["xussr_chme3"]["variant_group"])

    def test_retire_early_is_zero(self):
        """Набор раннего ухода не задаёт (`get_retire_early` возвращает 0)."""
        self.assertEqual({t["retire_early"] for t in self.items}, {0})


if __name__ == "__main__":
    unittest.main()
