"""Industry pictures for the chain graph, from FIRS's own documentation assets.

FIRS ships a finished isometric picture of every industry for its docs
(src/docs/static/img/industries/*.png, drawn by hand — not a build artefact),
the same picture the game's industry list shows. Two copies are kept: the file
as it is, for the graph zoomed in, and a half-size one for the graph at rest.
The half is nearest-neighbour: the pictures are not 2x sprites (about a fifth of
the pixels sit off the 2x grid), so any filtering would invent colours the
palette does not have.

Output: the `image` / `image_small` paths the industry record names (extract_firs.py),
under web/public.
"""
import os
import shutil

from PIL import Image

from common import REPO_ROOT, VENDOR, load_json

SOURCE_DIR = os.path.join(VENDOR, "firs", "src", "docs", "static", "img", "industries")
PUBLIC_DIR = os.path.join(REPO_ROOT, "web", "public")


def main():
    industries = load_json("industries.json")["items"]
    for industry in industries:
        source = os.path.join(SOURCE_DIR, f"{industry['id']}.png")
        if not os.path.exists(source):
            raise SystemExit(f"{industry['id']}: FIRS ships no picture at {source}")
        full = os.path.join(PUBLIC_DIR, industry["image"])
        small = os.path.join(PUBLIC_DIR, industry["image_small"])
        os.makedirs(os.path.dirname(full), exist_ok=True)
        os.makedirs(os.path.dirname(small), exist_ok=True)
        shutil.copyfile(source, full)
        image = Image.open(source)
        image.resize(
            (round(image.width / 2), round(image.height / 2)), Image.Resampling.NEAREST
        ).save(small, optimize=True)
    print(f"industry images: {len(industries)} -> {PUBLIC_DIR}")


if __name__ == "__main__":
    main()
