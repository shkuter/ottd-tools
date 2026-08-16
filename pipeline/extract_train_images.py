"""Картинки машин Iron Horse для SPA.

Требует предварительно сгенерированных спрайтшитов:
  cd vendor/iron-horse && python src/render_graphics.py --grf-name=iron-horse

Переиспользует render_docs.render_docs_vehicle_images (crop buy-menu спрайта,
пантографы, ремап цветов компании) и складывает по одной картинке на модель
(дефолтная ливрея, первый CC-ремап) в web/public/icons/trains/<model_id>.png.
"""
import os
import shutil
import sys
import tempfile

from common import REPO_ROOT, VENDOR

IH_ROOT = os.path.join(VENDOR, "iron-horse")
os.chdir(IH_ROOT)
sys.argv = ["export", "--grf-name=iron-horse"]
sys.path.insert(0, os.path.join(IH_ROOT, "src"))

import iron_horse  # noqa: E402
from doc_helper import DocHelper  # noqa: E402
import render_docs  # noqa: E402

TRAIN_ICONS_DIR = os.path.join(REPO_ROOT, "web", "public", "icons", "trains")
GENERATED_GRAPHICS = os.path.join(IH_ROOT, "generated", "graphics", "iron-horse")


def main():
    if not os.path.isdir(GENERATED_GRAPHICS):
        sys.exit(
            f"нет {GENERATED_GRAPHICS}: сначала запустить render_graphics.py (см. docstring)"
        )
    iron_horse.main()
    roster = iron_horse.roster_manager.active_roster
    dh = DocHelper(roster.get_lang_data("english", context="docs"))

    os.makedirs(TRAIN_ICONS_DIR, exist_ok=True)
    tmp_dir = tempfile.mkdtemp(prefix="ih_docs_img_")
    os.makedirs(os.path.join(tmp_dir, "img"), exist_ok=True)

    done = 0
    failed = []
    for catalogue in roster.catalogues:
        if catalogue.clone_quacker.quack:
            continue
        model_variant = catalogue.example_model_variant
        try:
            render_docs.render_docs_vehicle_images(
                {"catalogue": catalogue, "model_variants": [model_variant]},
                tmp_dir,
                GENERATED_GRAPHICS,
                dh,
            )
            cc_pair = model_variant.catalogue_entry.livery_def.docs_image_input_cc[0]
            remap_name = dh.get_livery_file_substr(cc_pair)
            src = os.path.join(tmp_dir, "img", f"{model_variant.id}_{remap_name}.png")
            shutil.copyfile(
                src, os.path.join(TRAIN_ICONS_DIR, f"{catalogue.model_id}.png")
            )
            done += 1
        except Exception as e:  # noqa: BLE001 — картинка не критична, идём дальше
            failed.append((catalogue.model_id, repr(e)[:80]))

    shutil.rmtree(tmp_dir, ignore_errors=True)
    print(f"train images: {done} -> {TRAIN_ICONS_DIR}, failed: {len(failed)}")
    for model_id, err in failed[:15]:
        print(f"  FAIL {model_id}: {err}")


if __name__ == "__main__":
    main()
