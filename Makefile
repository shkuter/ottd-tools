IRON_HORSE_REF ?= v4.29.0
FIRS_REF ?= 5.2.0
# The game's own locale names 57 of the cargos and industries the calculator shows,
# so the checkout it comes from is pinned like every other data source.
OPENTTD_REF ?= 15.3
OPENGFX2_REF ?= 0.8.1
# Russian FIRS translation players actually run (fork of FIRS 5.2.0), pinned by commit
FIRS_RU_REF ?= 61a0f0973cce43c41e156f7809782e7567279330
VENV = pipeline/.venv
PY = $(VENV)/bin/python

.PHONY: fetch fetch-firs-ru fetch-opengfx2 venv data check-i18n data-images data-opengfx2 dev build test verify release release-auto

# Shallow-клоны исходников в vendor/ (iron-horse и firs пинуются релизными тегами)
fetch:
	mkdir -p vendor
	[ -d vendor/iron-horse ] || git clone --depth 1 --branch $(IRON_HORSE_REF) https://github.com/andythenorth/iron-horse.git vendor/iron-horse
	[ -d vendor/firs ] || git clone --depth 1 --branch $(FIRS_REF) https://github.com/andythenorth/firs.git vendor/firs
	[ -d vendor/openttd ] || git clone --depth 1 --branch $(OPENTTD_REF) https://github.com/OpenTTD/OpenTTD.git vendor/openttd
	[ -d vendor/openttd-patches ] || git clone --depth 1 https://github.com/JGRennison/OpenTTD-patches.git vendor/openttd-patches
	$(MAKE) fetch-firs-ru

# Russian names of FIRS cargos and industries. A single 43 KiB file, so it is fetched
# by raw URL at the pinned commit instead of cloning the whole 7400-commit fork.
# vendor/firs-ru/.ref records what was downloaded — bumping FIRS_RU_REF refetches.
fetch-firs-ru:
	mkdir -p vendor/firs-ru
	@[ "$$(cat vendor/firs-ru/.ref 2>/dev/null)" = "$(FIRS_RU_REF)" ] && [ -f vendor/firs-ru/russian.toml ] || { \
		curl -fsSL -o vendor/firs-ru/russian.toml \
			https://raw.githubusercontent.com/ChronosXYZ/firs-ru/$(FIRS_RU_REF)/src/grf/lang/russian.toml && \
		echo $(FIRS_RU_REF) > vendor/firs-ru/.ref; }

venv:
	python3 -m venv $(VENV)
	$(VENV)/bin/pip install -r pipeline/requirements.txt

data: fetch-firs-ru
	$(PY) pipeline/extract_iron_horse.py
	$(PY) pipeline/extract_firs.py
	$(PY) pipeline/extract_vanilla.py
	$(PY) pipeline/extract_firs_ru.py
	$(PY) pipeline/validate.py

# Do the committed Russian name dictionaries still match the sources they came from?
check-i18n:
	$(PY) pipeline/extract_firs_ru.py --check

# OpenGFX2 Classic base set. Usually already downloaded by the game itself —
# the extractor finds it on its own; this target is for machines without it.
fetch-opengfx2:
	mkdir -p vendor/opengfx2
	curl -fsSL -o vendor/opengfx2/opengfx2_classic.zip \
		https://cdn.openttd.org/opengfx2_classic-releases/$(OPENGFX2_REF)/opengfx2_classic-$(OPENGFX2_REF)-all.zip
	cd vendor/opengfx2 && unzip -oj opengfx2_classic.zip

# vanilla-mode graphics: vehicle sprites, cargo icons, GUI palette
data-opengfx2:
	$(PY) pipeline/extract_opengfx2.py

# картинки машин: рендер спрайтшитов (небыстро) + нарезка buy-menu спрайтов
data-images:
	cd vendor/iron-horse && ../../$(PY) src/render_graphics.py --grf-name=iron-horse --pool_workers=8
	$(PY) pipeline/extract_train_images.py

dev:
	cd web && npm run dev

build:
	cd web && npm run build

test:
	$(PY) -m unittest discover -s pipeline/tests
	cd web && npx vitest run

verify: data check-i18n test build

# Релиз по semver: закрывает Unreleased в CHANGELOG.md, бампает web/package.json,
# коммитит и ставит тег vX.Y.Z. Пример: make release VERSION=0.2.0
release:
	@scripts/release.sh $(VERSION)

# То же, но версия считается по CHANGELOG: **BREAKING**/Removed — major, Added — minor,
# остальное — patch (пока версия 0.x, major понижается до minor)
release-auto:
	@scripts/release.sh "$$(scripts/next-version.sh)"
