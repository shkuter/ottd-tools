"""Нарезка buy-menu-спрайтов xUSSR из png исходников в web/public/icons/xussr/.

Каждая машина показывается в меню покупки спрайтсетом
`<имя>_purchase_graphics_ico` (вариант с иконкой рода тока — то, что видит игрок
при параметрах набора по умолчанию, enable_icons = 1). Координаты берутся из
шаблона new_purchase_template(x, y) = [x, y, 100, 18, …]; варианты типов делят
спрайт с базовой моделью через цепочку switch'ей — по ней идёт эмулятор.
"""
import json
import os

from PIL import Image

from common import DATA_DIR, REPO_ROOT
import xussr_nml as nml
from extract_xussr import GRFS, JUST_BUILT, read_grfs

ICONS = os.path.join(REPO_ROOT, "web", "public", "icons", "xussr")
WIDTH, HEIGHT = 100, 18
TRANSPARENT_INDEX = 0  # синий фон палитры набора


def spritesets(grf_statements):
    return {str(s.name): s for s in grf_statements if type(s).__name__ == "SpriteSet"}


def resolve_purchase(grf, sets, purchase_result, intro_year):
    """Имя ico-спрайтсета из записи purchase graphics-блока.

    Контекст тот же, что у чисел: машина первого выпуска — ливрея, зависящая от
    года (цепочки с check_year), берётся исходной."""
    value = purchase_result.value
    name = str(value)
    if name in sets:
        return name
    variables = dict(
        JUST_BUILT, build_year=intro_year, current_year=intro_year, date_of_last_service=0
    )
    result = grf.emulator.run(name, variables)
    # цепочка заканчивается ссылкой на спрайтсет — выражением она не сворачивается
    if isinstance(result, nml.Partial) and type(result.expr).__name__ == "Identifier":
        return result.expr.value
    raise SystemExit(f"extract_xussr_images: {grf.name}/{name}: no sprite set behind purchase")


def cut(image_cache, png_path, x, y):
    image = image_cache.get(png_path)
    if image is None:
        image = Image.open(png_path).convert("RGBA")
        # прозрачность: фоновая синь палитры
        palette_image = Image.open(png_path)
        if palette_image.mode == "P":
            base = palette_image.point(lambda i: 255 if i == TRANSPARENT_INDEX else 0).convert("L")
            image.putalpha(Image.eval(base, lambda v: 255 - v))
        image_cache[png_path] = image
    return image.crop((x, y, x + WIDTH, y + HEIGHT))


def main():
    with open(os.path.join(DATA_DIR, "xussr_trains.json")) as f:
        items = json.load(f)["items"]
    grfs = read_grfs()
    sets_by_grf = {name: spritesets(grfs[name].flat) for name in GRFS}
    os.makedirs(ICONS, exist_ok=True)

    image_cache = {}
    written = 0
    for item in items:
        grf = grfs[item["grf"]]
        sets = sets_by_grf[item["grf"]]
        merged = grf.merged_items()[item["item"]]
        purchase = merged["graphics"].get("purchase")
        if purchase is None:
            raise SystemExit(f"extract_xussr_images: {item['id']}: no purchase graphics")
        # при enable_icons = 1 первый ряд switch'а — вариант с иконкой
        ico = resolve_purchase(grf, sets, purchase, item["intro_year"])
        sprite_set = sets[ico]
        usage = sprite_set.sprite_list[0]
        if str(usage.name) != "new_purchase_template":
            raise SystemExit(f"extract_xussr_images: {item['id']}: template {usage.name}")
        x = nml.const(usage.param_list[0], grf.scope)
        y = nml.const(usage.param_list[1], grf.scope)
        png = os.path.join(nml.XUSSR_ROOT, sprite_set.image_file.value)
        sprite = cut(image_cache, png, x, y)
        sprite.save(os.path.join(ICONS, f"{item['id']}.png"))
        written += 1
    print(f"icons/xussr: {written} sprites")


if __name__ == "__main__":
    main()
