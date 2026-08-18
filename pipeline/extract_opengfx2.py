"""OpenGFX2 Classic graphics for vanilla mode (Iron Horse switched off).

Three things are pulled out of the base set:
  * vehicle sprites -> web/public/icons/vanilla_trains/vanilla_<n>.png
  * cargo icons     -> web/public/icons/vanilla_cargo/<id>.png
  * GUI gradients   -> web/src/data/opengfx2_palette.json

Sprite numbers come from vanilla_*.json (extract_vanilla.py computes them from
the game's own tables), so all that is left here is fetching the pixels.
"""
import glob
import os
import re
import sys

from PIL import Image

from common import REPO_ROOT, VENDOR, load_json, write_json
from grf_sprites import (
    ZOOM_IN_2X,
    GrfError,
    base_set_palette_is_dos,
    load_base_set,
    read_palette,
)

TRAIN_DIR = os.path.join(REPO_ROOT, "web", "public", "icons", "vanilla_trains")
CARGO_DIR = os.path.join(REPO_ROOT, "web", "public", "icons", "vanilla_cargo")
PALETTES_H = os.path.join(VENDOR, "openttd", "src", "table", "palettes.h")
GFX_TYPE_H = os.path.join(VENDOR, "openttd", "src", "gfx_type.h")

# where to look for the set: placed by hand, downloaded by the game, Steam copy
BASE_SET_GLOBS = [
    os.path.join(VENDOR, "opengfx2", "ogfx21_base_8.grf"),
    os.path.join(VENDOR, "opengfx2", "*OpenGFX2_Classic*.tar"),
    os.path.expanduser("~/Documents/OpenTTD/content_download/baseset/*OpenGFX2_Classic*.tar"),
    os.path.expanduser(
        "~/Library/Application Support/Steam/steamapps/common/OpenTTD/baseset/OpenGFX2_Classic*.tar"
    ),
]

# ogfx21_base_8.grf from OpenGFX2 Classic 0.8.1: a checksum is a better version
# anchor than a file name — a different set would shift every SpriteID
BASE_SET_MD5 = "3cb291c44173828d77d839e184ef9c96"

# dual-headed vehicles are drawn as two halves (DrawTrainEngine, train_cmd.cpp:565-582)
VEHICLE_WIDTH = 29  # TRAININFO_DEFAULT_VEHICLE_WIDTH

# the sprite is shown at 1x logical size while the file is 4x, so pixels divide
# evenly on HiDPI screens — same trick as the Iron Horse docs images use
UPSCALE = 4
SPRITE_HEIGHT = 16  # .train-sprite in index.css

PALETTE_RECOLOUR_START = 775  # sprites.h:1762
GRADIENT_OFFSET = 0xC6  # main_gui.cpp:555-562


def find_base_set():
    for pattern in BASE_SET_GLOBS:
        found = sorted(glob.glob(pattern))
        if found:
            return found[-1]
    sys.exit(
        "OpenGFX2 Classic not found. Download it in game (Check Online Content → Base\n"
        "graphics) or put the set into vendor/opengfx2/ (see make fetch-opengfx2)"
    )


def colour_names():
    """GUI colour names in enum Colours order (gfx_type.h:283)."""
    text = open(GFX_TYPE_H).read()
    start = text.index("enum class Colours")
    block = text[start : text.index("};", start)]
    names = []
    for line in block.splitlines():
        m = re.match(r"\s*(\w+)(?:\s*=\s*Colours::Begin)?,\s*///<", line)
        if m and m.group(1) not in ("Begin", "End", "Invalid"):
            names.append(m.group(1))
    return names


def draw_parts(parts, palette):
    """Compose sprites into one image using their drawing offsets.

    parts is a list of (x, Sprite) where x is the draw position of a vehicle
    half, while the sprite's own x_offs/y_offs shift the pixels relative to it.
    """
    left = min(x + s.x_offs for x, s in parts)
    right = max(x + s.x_offs + s.width for x, s in parts)
    top = min(s.y_offs for _, s in parts)
    bottom = max(s.y_offs + s.height for _, s in parts)

    canvas = Image.new("P", (right - left, bottom - top), 0)
    canvas.putpalette(palette)
    for x, sprite in parts:
        canvas.paste(sprite.to_image(palette), (x + sprite.x_offs - left, sprite.y_offs - top))
    return canvas, top, bottom


def render_trains(grf, palette, trains):
    """Vehicle sprites: shared baseline, one frame height for the whole catalogue."""
    os.makedirs(TRAIN_DIR, exist_ok=True)

    drawn, missing = {}, []
    for train in trains:
        front = grf.sprite(train["sprite_id"])
        if front is None:
            missing.append(train["id"])
            continue
        if train["dual_headed"]:
            # front half sits left of centre, rear half right (train_cmd.cpp:581-582)
            rear = grf.sprite(train["sprite_id_rear"])
            parts = [(-(VEHICLE_WIDTH // 2), front)]
            if rear is not None:
                parts.append((VEHICLE_WIDTH - VEHICLE_WIDTH // 2, rear))
        else:
            parts = [(0, front)]
        drawn[train["id"]] = parts

    # one coordinate system for everything, so all vehicles share a baseline
    top = min(s.y_offs for parts in drawn.values() for _, s in parts)
    bottom = max(s.y_offs + s.height for parts in drawn.values() for _, s in parts)
    height = max(SPRITE_HEIGHT, bottom - top)
    pad_top = (height - (bottom - top)) // 2

    for train_id, parts in drawn.items():
        image, part_top, _ = draw_parts(parts, palette)
        frame = Image.new("P", (image.width, height), 0)
        frame.putpalette(palette)
        frame.paste(image, (0, pad_top + part_top - top))
        frame = frame.resize((frame.width * UPSCALE, height * UPSCALE), Image.Resampling.NEAREST)
        frame.save(os.path.join(TRAIN_DIR, f"{train_id}.png"), optimize=True, transparency=0)

    return len(drawn), missing


def render_cargos(grf, palette, cargos):
    """Cargo icons: take the 20x20 variant (In2x zoom), matching FIRS icons."""
    os.makedirs(CARGO_DIR, exist_ok=True)
    count, missing = 0, []
    for cargo in cargos:
        sprite = grf.sprite(cargo["sprite_id"], zoom=ZOOM_IN_2X) or grf.sprite(cargo["sprite_id"])
        if sprite is None:
            missing.append(cargo["id"])
            continue
        sprite.to_image(palette).save(
            os.path.join(CARGO_DIR, f"{cargo['id']}.png"), optimize=True, transparency=0
        )
        count += 1
    return count, missing


def render_palette(grf, palette):
    """GUI gradients: 16 colours of 8 shades, read the way the game reads them."""
    names = colour_names()
    gradients = {}
    for index, name in enumerate(names):
        table = grf.recolour(PALETTE_RECOLOUR_START + index)
        if table is None:
            raise GrfError(f"no recolour sprite for colour {name}")
        shades = []
        for shade in range(8):
            colour_index = table[GRADIENT_OFFSET + shade]
            r, g, b = palette[colour_index * 3 : colour_index * 3 + 3]
            shades.append(f"#{r:02x}{g:02x}{b:02x}")
        gradients[name[0].lower() + name[1:]] = shades
    return gradients


def main():
    path = find_base_set()
    if not base_set_palette_is_dos(path):
        sys.exit(f"{path}: set is not in the DOS palette, a W→D remap would be needed")
    print(f"base set: {path}")

    grf = load_base_set(path)
    if grf.md5 != BASE_SET_MD5:
        sys.exit(
            f"{path}: ogfx21_base_8.grf has md5 {grf.md5}, expected {BASE_SET_MD5}\n"
            "this is a different OpenGFX2 Classic release — sprite numbers may have\n"
            "shifted, so check against the game and update BASE_SET_MD5 deliberately"
        )
    palette = read_palette(PALETTES_H)
    trains = load_json("vanilla_trains.json")["items"]
    cargos = load_json("vanilla_cargos.json")["items"]

    drawn, missing_trains = render_trains(grf, palette, trains)
    icons, missing_cargos = render_cargos(grf, palette, cargos)
    write_json("opengfx2_palette.json", {
        "source": os.path.basename(path),
        "gradients": render_palette(grf, palette),
    })

    print(f"opengfx2: {drawn} vehicles, {icons} cargo icons")
    if missing_trains or missing_cargos:
        sys.exit(f"missing sprites: vehicles {missing_trains}, cargos {missing_cargos}")


if __name__ == "__main__":
    main()
