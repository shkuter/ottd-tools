IRON_HORSE_REF ?= v4.29.0
FIRS_REF ?= 5.2.0
# The game's own locale names 57 of the cargos and industries the calculator shows,
# so the checkout it comes from is pinned like every other data source.
OPENTTD_REF ?= 15.3
# JGR's Patchpack: the calculator reproduces its formulas, so the reference it is read
# from is pinned like every other source. The version players run is the one to pin —
# a moving checkout would quietly change what the patchpack notes are checked against.
OPENTTD_PATCHES_REF ?= jgrpp-0.73.1
OPENGFX2_REF ?= 0.8.1
# Russian FIRS translation players actually run (fork of FIRS 5.2.0), pinned by commit
FIRS_RU_REF ?= 61a0f0973cce43c41e156f7809782e7567279330
# xUSSR Railway Set. The project is abandoned and carries no release holding the state
# of its add-ons, so the pin is the final commit rather than a tag. The pin is a fork:
# upstream still declares the FIRS 4 cargo range, so with FIRS 5.2 no wagon of the set
# takes ferroalloys, steel products or chemicals at all. The fork adds those labels and
# is offered back upstream (George-VB/xussrset#257); once it lands, the pin moves back.
XUSSR_REPO ?= https://github.com/shkuter/xussrset.git
XUSSR_REF ?= 3c6d382b87713261a2139197268ac016c22c2002
VENV = pipeline/.venv
PY = $(VENV)/bin/python

.PHONY: fetch fetch-firs-ru fetch-xussr fetch-opengfx2 venv data data-xussr check-i18n data-images data-opengfx2 dev build test check-visual verify release release-auto deploy

# Shallow-клоны исходников в vendor/ (iron-horse и firs пинуются релизными тегами)
fetch:
	mkdir -p vendor
	[ -d vendor/iron-horse ] || git clone --depth 1 --branch $(IRON_HORSE_REF) https://github.com/andythenorth/iron-horse.git vendor/iron-horse
	[ -d vendor/firs ] || git clone --depth 1 --branch $(FIRS_REF) https://github.com/andythenorth/firs.git vendor/firs
	[ -d vendor/openttd ] || git clone --depth 1 --branch $(OPENTTD_REF) https://github.com/OpenTTD/OpenTTD.git vendor/openttd
	[ -d vendor/openttd-patches ] || git clone --depth 1 --branch $(OPENTTD_PATCHES_REF) https://github.com/JGRennison/OpenTTD-patches.git vendor/openttd-patches
	$(MAKE) fetch-firs-ru
	$(MAKE) fetch-xussr

# Russian names of FIRS cargos and industries. A single 43 KiB file, so it is fetched
# by raw URL at the pinned commit instead of cloning the whole 7400-commit fork.
# vendor/firs-ru/.ref records what was downloaded — bumping FIRS_RU_REF refetches.
fetch-firs-ru:
	mkdir -p vendor/firs-ru
	@[ "$$(cat vendor/firs-ru/.ref 2>/dev/null)" = "$(FIRS_RU_REF)" ] && [ -f vendor/firs-ru/russian.toml ] || { \
		curl -fsSL -o vendor/firs-ru/russian.toml \
			https://raw.githubusercontent.com/ChronosXYZ/firs-ru/$(FIRS_RU_REF)/src/grf/lang/russian.toml && \
		echo $(FIRS_RU_REF) > vendor/firs-ru/.ref; }

# xUSSR sources, pinned by commit: `git clone --branch` takes only names, so the
# pinned object is fetched directly (GitHub serves a commit by sha at depth 1).
fetch-xussr:
	@[ -d vendor/xussrset ] || { \
		mkdir -p vendor/xussrset && \
		git -C vendor/xussrset init -q && \
		git -C vendor/xussrset remote add origin $(XUSSR_REPO) && \
		git -C vendor/xussrset fetch -q --depth 20 --tags origin $(XUSSR_REF) && \
		git -C vendor/xussrset checkout -q FETCH_HEAD; }

venv:
	python3 -m venv $(VENV)
	$(VENV)/bin/pip install -r pipeline/requirements.txt

data: fetch-firs-ru fetch-xussr data-xussr
	$(PY) pipeline/extract_iron_horse.py
	$(PY) pipeline/extract_firs.py
	$(PY) pipeline/extract_vanilla.py
	$(PY) pipeline/extract_town_names.py
	$(PY) pipeline/extract_station_names.py
	$(PY) pipeline/extract_firs_ru.py
	$(PY) pipeline/validate.py

# The xUSSR catalogue and its Russian names on their own: the set parses from NML through
# the C preprocessor and takes a while, and it is the one part worth re-running by itself.
data-xussr: fetch-xussr
	$(PY) pipeline/extract_xussr.py
	$(PY) pipeline/extract_xussr_ru.py

# Do the committed Russian name dictionaries still match the sources they came from?
check-i18n:
	$(PY) pipeline/extract_firs_ru.py --check
	$(PY) pipeline/extract_xussr_ru.py --check
	$(PY) pipeline/extract_station_names.py --check

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
	$(PY) pipeline/extract_xussr_images.py

dev:
	cd web && npm run dev

build:
	cd web && npm run build

test:
	$(PY) -m unittest discover -s pipeline/tests
	cd web && npx vitest run

# Does the skin still look like a window of the game? Opens the built bundle in a real
# browser and asks about the computed styles — the class of defect a stylesheet read as
# text cannot show (a rule that matches nothing, a colour the browser itself supplies).
# The browser is Playwright's Chromium, installed once with `npx playwright install chromium`
# (npm install brings no browser); CHROME_PATH points at another build. Not in pages.yml:
# publishing the site stays Node-only.
check-visual: build
	cd web && npm run test:visual

# build is reached through check-visual, so the bundle is built once
verify: data check-i18n test check-visual

# Релиз по semver: закрывает Unreleased в CHANGELOG.md, бампает web/package.json,
# коммитит и ставит тег vX.Y.Z. Пример: make release VERSION=0.2.0
release:
	@scripts/release.sh $(VERSION)

# То же, но версия считается по CHANGELOG: **BREAKING**/Removed — major, Added — minor,
# остальное — patch (пока версия 0.x, major понижается до minor)
release-auto:
	@scripts/release.sh "$$(scripts/next-version.sh)"

# Ручная выкладка сайта без релиза: запускает pages.yml на текущей ветке и ждёт результата.
# Тег vX.Y.Z публикует сайт сам, эта цель — чтобы перевыложить master между релизами.
deploy:
	gh workflow run pages.yml --ref "$$(git rev-parse --abbrev-ref HEAD)"
	@echo "deploy: запуск создаётся..."
	@sleep 8
	@gh run watch "$$(gh run list --workflow=pages.yml --limit 1 --json databaseId --jq '.[0].databaseId')" --exit-status
