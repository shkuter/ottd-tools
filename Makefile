IRON_HORSE_REF ?= v4.29.0
VENV = pipeline/.venv
PY = $(VENV)/bin/python

.PHONY: fetch venv data data-images dev build test verify

# Shallow-клоны исходников в vendor/ (iron-horse пиновать тегом, firs — master)
fetch:
	mkdir -p vendor
	[ -d vendor/iron-horse ] || git clone --depth 1 --branch $(IRON_HORSE_REF) https://github.com/andythenorth/iron-horse.git vendor/iron-horse
	[ -d vendor/firs ] || git clone --depth 1 https://github.com/andythenorth/firs.git vendor/firs
	[ -d vendor/openttd ] || git clone --depth 1 https://github.com/OpenTTD/OpenTTD.git vendor/openttd

venv:
	python3 -m venv $(VENV)
	$(VENV)/bin/pip install Pillow Chameleon markdown

data:
	$(PY) pipeline/extract_iron_horse.py
	$(PY) pipeline/extract_firs.py
	$(PY) pipeline/validate.py

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

verify: data test build
