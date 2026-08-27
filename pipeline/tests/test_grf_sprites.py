"""The GRF decoder, and the two formats it had to learn for the interface icons.

Neither had come up in the base set before. A chunked sprite stores a row as runs
rather than end to end, and whatever the runs miss is transparent — which is how
the electrified-track button is drawn. An Action 5 block is how a NewGRF lays its
own sprites over the game's numbers: the base set does not hold that button at all.

Both were read off the game's sources (grf.cpp:110 and newgrf_act5.cpp:94), so what
is checked here is not that the code runs but that the format was understood: data
built by hand with a known answer, corrupt cases included, where the decoder is
required to refuse rather than hand back rubbish.
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from grf_sprites import GrfError, unchunk  # noqa: E402
from extract_vanilla import sprite_constants  # noqa: E402


def row(runs):
    """One row of a chunked sprite, as (skip, [pixels]) left to right."""
    out = bytearray()
    for index, (skip, pixels) in enumerate(runs):
        last = 0x80 if index == len(runs) - 1 else 0
        out += bytes([len(pixels) | last, skip]) + bytes(pixels)
    return bytes(out)


def chunked(rows):
    """The stream as the decompressor hands it over: row offsets, then the rows."""
    table = bytearray()
    body = bytearray()
    offset = len(rows) * 2
    for data in rows:
        table += offset.to_bytes(2, "little")
        body += data
        offset += len(data)
    return bytes(table + body)


class UnchunkTest(unittest.TestCase):
    def test_gaps_between_runs_are_transparent(self):
        """What no run covers stays index 0, which is transparent."""
        data = chunked([row([(1, [7, 7])]), row([(0, [9])])])

        self.assertEqual(unchunk(data, 4, 2), bytes([0, 7, 7, 0, 9, 0, 0, 0]))

    def test_several_runs_in_one_row(self):
        """Two runs with a hole between them — the ordinary case for a button."""
        data = chunked([row([(0, [1]), (3, [2, 2])])])

        self.assertEqual(unchunk(data, 5, 1), bytes([1, 0, 0, 2, 2]))

    def test_a_row_of_no_runs_at_all(self):
        """An empty row is one run of zero length, not a missing row."""
        data = chunked([row([(0, [])])])

        self.assertEqual(unchunk(data, 3, 1), bytes([0, 0, 0]))

    def test_a_run_past_the_row_is_refused(self):
        """A run reaching past the width is corruption: trimming it silently would hide that."""
        data = chunked([row([(2, [5, 5, 5])])])

        with self.assertRaises(GrfError):
            unchunk(data, 3, 1)

    def test_an_offset_past_the_data_is_refused(self):
        """A row offset outside the stream is corruption too."""
        data = bytes([200, 0]) + bytes([1, 0, 42])

        with self.assertRaises(GrfError):
            unchunk(data, 1, 1)

    def test_too_wide_for_the_two_byte_header(self):
        """Past 256 pixels the run header is a different shape; such sprites are not ours."""
        with self.assertRaises(GrfError):
            unchunk(bytes(600), 300, 1)


class SpriteConstantTest(unittest.TestCase):
    """The game states sprite numbers as a chain: a name is a name plus a count."""

    def setUp(self):
        self.value = sprite_constants()

    def test_a_plain_number(self):
        """The start of a chain is a plain number (misc_gui.cpp addresses it by that)."""
        self.assertEqual(self.value("SPR_IMG_SUBSIDIES"), 679)

    def test_a_chain_of_offsets(self):
        """The track button is a block base plus an offset, and the base is itself a chain."""
        base = self.value("SPR_ELRAIL_BASE")
        self.assertEqual(self.value("SPR_BUILD_EW_ELRAIL"), base + 38)

    def test_a_name_the_header_does_not_state(self):
        """A misspelt name is an error, not a silent zero."""
        with self.assertRaises(KeyError):
            self.value("SPR_NOT_A_REAL_CONSTANT")


if __name__ == "__main__":
    unittest.main()
