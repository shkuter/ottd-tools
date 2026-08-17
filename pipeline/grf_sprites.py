"""Sprite reader for base-set GRF files (container v2).

Needed to show vanilla vehicles and cargos with OpenGFX2 Classic graphics.
The format was taken from the game sources:
  vendor/openttd/src/spritecache.cpp      — ReadGRFSpriteOffsets, LoadNextSprite
  vendor/openttd/src/spriteloader/grf.cpp — LoadSpriteV2, DecodeSingleSprite

The key property of a base set (vendor/openttd/src/gfxinit.cpp:175): the game
loads it as LoadGrfFile(file, 0, ...) and bumps the index on every info-section
entry, so SpriteID equals the ordinal number of that entry. In other words,
sprite numbers from the game tables (train_sprites.h, sprites.h) address the
file directly.
"""
import hashlib
import os
import re
import struct
import tarfile

from PIL import Image

CONTAINER_V2_SIGNATURE = b"\x00\x00GRF\x82\x0d\x0a\x1a\x0a"

# low bits of `type` hold the colour components (spriteloader.hpp:22)
COMPONENT_RGB = 0x01
COMPONENT_ALPHA = 0x02
COMPONENT_PALETTE = 0x04
COMPONENT_MASK = 0x07

CHUNKED = 0x08  # per-row offset table; not used by the sprites we need

# `zoom` byte in the file → zoom level (zoom_lvl_map in grf.cpp:258)
ZOOM_NORMAL = 0
ZOOM_IN_4X = 1
ZOOM_IN_2X = 2


class GrfError(Exception):
    pass


def _u8(buf, pos):
    return buf[pos], pos + 1


def _u16(buf, pos):
    return struct.unpack_from("<H", buf, pos)[0], pos + 2


def _s16(buf, pos):
    return struct.unpack_from("<h", buf, pos)[0], pos + 2


def _u32(buf, pos):
    return struct.unpack_from("<I", buf, pos)[0], pos + 4


def decode_sprite_data(buf, pos, size):
    """Unpack sprite data: GRF's own byte-level LZ (grf.cpp:72-97).

    code >= 0 — literal run (0 means 0x80 bytes),
    code <  0 — back reference: 11 bits of offset, length -(code >> 3).
    """
    out = bytearray()
    while len(out) < size:
        code = buf[pos]
        pos += 1
        if code < 0x80:
            length = code if code else 0x80
            out += buf[pos : pos + length]
            pos += length
        else:
            code -= 256  # to signed
            offset = ((code & 7) << 8) | buf[pos]
            pos += 1
            length = -(code >> 3)
            if offset > len(out):
                raise GrfError("back reference points before the decoded data")
            for _ in range(length):
                out.append(out[-offset])
    if len(out) != size:
        raise GrfError(f"decoded {len(out)} bytes instead of {size}")
    return bytes(out), pos


class Sprite:
    """A single sprite variant: 8bpp indices plus drawing offsets."""

    def __init__(self, width, height, x_offs, y_offs, indices):
        self.width = width
        self.height = height
        self.x_offs = x_offs
        self.y_offs = y_offs
        self.indices = indices

    def to_image(self, palette):
        """PIL image in the game's DOS palette; index 0 is transparent."""
        img = Image.frombytes("P", (self.width, self.height), self.indices)
        img.putpalette(palette)
        img.info["transparency"] = 0
        return img


class BaseSetGrf:
    """Base-set sprites addressed by global SpriteID."""

    def __init__(self, data):
        if not data.startswith(CONTAINER_V2_SIGNATURE):
            raise GrfError("not a GRF container v2")
        self.data = data
        self.md5 = hashlib.md5(data).hexdigest()
        self._data_section = self._read_sprite_offsets()
        self._info = self._read_info_section()

    def _read_sprite_offsets(self):
        """Offsets of data-section entries, keyed by their in-file id."""
        data_offset, pos = _u32(self.data, len(CONTAINER_V2_SIGNATURE))
        pos += data_offset  # SeekTo(data_offset, SEEK_CUR)
        offsets = {}
        while True:
            sprite_id, pos = _u32(self.data, pos)
            if sprite_id == 0:
                break
            offsets.setdefault(sprite_id, pos - 4)
            length, pos = _u32(self.data, pos)
            pos += length
        return offsets

    def _read_info_section(self):
        """Info-section entries in order: their position is the SpriteID."""
        pos = len(CONTAINER_V2_SIGNATURE) + 4
        compression, pos = _u8(self.data, pos)
        if compression != 0:
            raise GrfError(f"unsupported compression {compression}")
        info = []
        while True:
            num, pos = _u32(self.data, pos)
            if num == 0:
                break
            grf_type, pos = _u8(self.data, pos)
            if grf_type == 0xFF:
                # an empty pseudo-sprite ends the file (spritecache.cpp:626)
                if num == 1:
                    break
                info.append(("recolour", pos, num))
                pos += num
            elif grf_type == 0xFD:
                if num != 4:
                    break
                ref, pos = _u32(self.data, pos)
                info.append(("sprite", self._data_section.get(ref), num))
            else:
                break  # container v2 has no inline sprites
        return info

    def __len__(self):
        return len(self._info)

    def sprite(self, sprite_id, zoom=ZOOM_NORMAL):
        """An 8bpp variant of the sprite at the given zoom, or None.

        A SpriteID can hold several variants (cargo icons come as both 10x10
        and 20x20), so the pick is made by zoom and palette data, the same way
        LoadSpriteV2 does it.
        """
        kind, offset, _ = self._info[sprite_id]
        if kind != "sprite" or offset is None:
            return None
        entry_id, pos = _u32(self.data, offset)
        while True:
            num, pos = _u32(self.data, pos)
            start = pos
            type_byte, pos = _u8(self.data, pos)
            if type_byte == 0xFF:
                return None
            colour = type_byte & COMPONENT_MASK
            flags = type_byte & ~COMPONENT_MASK
            sprite_zoom, pos = _u8(self.data, pos)

            if colour == COMPONENT_PALETTE and sprite_zoom == zoom:
                height, pos = _u16(self.data, pos)
                width, pos = _u16(self.data, pos)
                x_offs, pos = _s16(self.data, pos)
                y_offs, pos = _s16(self.data, pos)
                if flags & CHUNKED:
                    size, pos = _u32(self.data, pos)
                else:
                    size = width * height  # palette data is one byte per pixel
                indices, _ = decode_sprite_data(self.data, pos, size)
                return Sprite(width, height, x_offs, y_offs, indices)

            # variants of one sprite follow each other, each with its own header
            pos = start + num
            next_id, after_id = _u32(self.data, pos)
            if next_id != entry_id:
                return None
            pos = after_id

    def recolour(self, sprite_id):
        """256-byte recolour table (the palette of a GUI colour)."""
        kind, offset, num = self._info[sprite_id]
        if kind != "recolour":
            return None
        # first byte is a marker, the rest maps palette indices (main_gui.cpp:556)
        return self.data[offset + 1 : offset + num]


def read_palette(palettes_h):
    """The game's DOS palette from src/table/palettes.h as flat RGB.

    The game table is used rather than docs/palettes/openttd.gpl: in the .gpl
    file indices 1-9 are overwritten with service markers (238,0,238 and on),
    while in the game these are the dark greys used by sprites and GUI alike.
    """
    text = open(palettes_h).read()
    start = text.index("static const Palette _palette")
    block = text[start : text.index("\n};", start)]
    palette = []
    for match in re.finditer(r"\b(?:M|Colour)\(([^)]*)\)", block):
        values = [int(v) for v in re.findall(r"\d+", match.group(1))]
        palette.extend(values[:3])
    if len(palette) != 256 * 3:
        raise GrfError(f"palette has {len(palette) // 3} colours instead of 256")
    return palette


def load_base_set(path, member="ogfx21_base_8.grf"):
    """The base-set GRF: from a directory, from a tar, or as a plain file."""
    if os.path.isdir(path):
        path = os.path.join(path, member)
    if path.endswith(".tar"):
        with tarfile.open(path) as tar:
            # by name, not by position: member order differs between copies
            for entry in tar.getmembers():
                if os.path.basename(entry.name) == member:
                    return BaseSetGrf(tar.extractfile(entry).read())
        raise GrfError(f"{path} has no {member}")
    with open(path, "rb") as f:
        return BaseSetGrf(f.read())


def base_set_palette_is_dos(path):
    """Check the set uses the DOS palette; a Windows one would need a remap."""
    if not path.endswith(".tar"):
        obg = os.path.join(os.path.dirname(path), "opengfx2_8.obg")
        text = open(obg).read() if os.path.exists(obg) else ""
    else:
        text = ""
        with tarfile.open(path) as tar:
            for entry in tar.getmembers():
                if entry.name.endswith(".obg"):
                    text = tar.extractfile(entry).read().decode("utf-8", "replace")
                    break
    return "palette" not in text or "DOS" in text
