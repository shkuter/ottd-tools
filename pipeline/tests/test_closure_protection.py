"""Why the completeness block says FIRS industries never close, checked against both sources.

OpenTTD closes industries in two places, and both are gated on the set NOT defining the
production-change callback: `!callback_enabled && Organic/Extractive` for primaries
(industry_cmd.cpp:2922) and `!callback_enabled && Processing` for secondaries (:3000, the
five-year `PROCESSING_INDUSTRY_ABANDONMENT_YEARS` rule). The callback itself is the other way out: 0x3 closes the industry outright, 0x4 hands the
decision back to the game's own rules, and every answer that halves or decrements production
(0x1, 0x5-0x8, 0xD) closes it once `PRODLEVEL_MINIMUM` is reached (:3013-3029).

FIRS defines `monthly_prod_change` for every industry template and answers
`CB_RESULT_IND_PROD_NO_CHANGE` (0x0), so neither gate opens — which is what its own
documentation says: "Industries will never close" (src/docs/templates/get_started.pt).

The tertiary template is the exception: it declares no `random_prod_change`, so the game's
random call (`ChangeIndustryProduction(i, false)`, :3116) finds no callback for those. They
are covered instead by being black holes, which the same routine returns on before reaching
any closure branch (:2919).

Four things would break the claim, and each has a test here: a template that stops declaring
the callback, a callback that answers something other than "no change", a tertiary that stops
being a black hole, and the flag that opts an industry out of the last-instance protection
(`IND_FLAG_ALLOW_CLOSING_LAST_INSTANCE` in NML; `CanCloseLastInstance` is the same flag inside
the game's C++ and never appears in a set's source, so grepping for that name would be a test
that cannot fail).
"""
import os
import re
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from common import REPO_ROOT  # noqa: E402

FIRS_SRC = os.path.join(REPO_ROOT, "vendor", "firs", "src")
TEMPLATES = os.path.join(FIRS_SRC, "grf", "templates")
NML_FLAG = "IND_FLAG_ALLOW_CLOSING_LAST_INSTANCE"
CALLBACK = "monthly_prod_change"
RANDOM_CALLBACK = "random_prod_change"
NO_CHANGE = "CB_RESULT_IND_PROD_NO_CHANGE"
BLACK_HOLE = "IND_LIFE_TYPE_BLACK_HOLE"


def files_naming(root, needle):
    """Files of the set naming this token, relative to `root`."""
    found = []
    for directory, _, files in os.walk(root):
        for name in sorted(files):
            if not name.endswith((".py", ".pynml")):
                continue
            path = os.path.join(directory, name)
            with open(path, encoding="utf-8") as handle:
                if needle in handle.read():
                    found.append(os.path.relpath(path, root))
    return found


@unittest.skipUnless(os.path.isdir(FIRS_SRC), "нужен vendor/firs (make fetch)")
class ClosureProtection(unittest.TestCase):
    def test_every_industry_template_defines_the_production_callback(self):
        templates = [
            name
            for name in sorted(os.listdir(TEMPLATES))
            if name.startswith("industry_") and name.endswith(".pynml")
        ]
        self.assertTrue(templates, "шаблоны предприятий не найдены — сменилась раскладка FIRS")
        for name in templates:
            with self.subTest(template=name), open(
                os.path.join(TEMPLATES, name), encoding="utf-8"
            ) as handle:
                self.assertIn(
                    CALLBACK,
                    handle.read(),
                    f"{name} больше не объявляет {CALLBACK} — предприятия набора снова могут закрываться",
                )

    def test_the_callback_answers_no_change(self):
        """The answer matters, not the token: 0x4 would hand closure back to the game.

        Read the body of each `switch(..., <id>_monthly_prod_change, 1)`, because the same
        constant also sits on the `random_prod_change` line of every industry template — a
        plain grep over the directory would stay green with the switch itself gone.
        """
        produce = [
            name
            for name in sorted(os.listdir(TEMPLATES))
            if name.startswith("produce_") and name.endswith(".pynml")
        ]
        self.assertEqual(
            len(produce), 5, "изменился набор produce-шаблонов FIRS — сверить закрытие заново"
        )
        for name in produce:
            with self.subTest(template=name), open(
                os.path.join(TEMPLATES, name), encoding="utf-8"
            ) as handle:
                body = re.search(
                    r"switch\([^)]*_monthly_prod_change[^)]*\)\s*\{(.*?)\}",
                    handle.read(),
                    re.S,
                )
                self.assertIsNotNone(body, f"{name}: switch {CALLBACK} не найден")
                self.assertIn(
                    NO_CHANGE,
                    body.group(1),
                    f"{name}: {CALLBACK} отвечает не {NO_CHANGE} — закрытие могло вернуться",
                )

    def test_the_industries_without_the_callback_are_black_holes(self):
        """Tertiaries declare no `random_prod_change`; their cover is the life type instead."""
        with open(os.path.join(TEMPLATES, "industry_tertiary.pynml"), encoding="utf-8") as handle:
            self.assertNotIn(
                RANDOM_CALLBACK,
                handle.read(),
                "tertiary-шаблон теперь объявляет random_prod_change — переписать обоснование",
            )
        industries = os.path.join(FIRS_SRC, "industries")
        for name in sorted(os.listdir(industries)):
            if not name.endswith(".py"):
                continue
            with open(os.path.join(industries, name), encoding="utf-8") as handle:
                source = handle.read()
            if "IndustryTertiary" not in source:
                continue
            with self.subTest(industry=name):
                self.assertIn(
                    BLACK_HOLE,
                    source,
                    f"{name}: третичное предприятие больше не {BLACK_HOLE} — закрытие может вернуться",
                )

    def test_no_industry_opts_out_of_last_instance_protection(self):
        self.assertEqual(
            files_naming(FIRS_SRC, NML_FLAG),
            [],
            f"{NML_FLAG} появился в FIRS — утверждение «единственное защищено» больше не общее",
        )

    def test_the_grep_would_notice_the_flag(self):
        """The guard itself: a directory that does name the flag has to be reported."""
        with tempfile.TemporaryDirectory() as tmp:
            with open(os.path.join(tmp, "industry.py"), "w", encoding="utf-8") as handle:
                handle.write(f"special_flags=['{NML_FLAG}']\n")
            self.assertEqual(files_naming(tmp, NML_FLAG), ["industry.py"])


if __name__ == "__main__":
    unittest.main()
