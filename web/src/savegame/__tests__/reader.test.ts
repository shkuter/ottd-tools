import { describe, expect, it } from 'vitest';
import { ByteReader, SavegameFormatError } from '../reader';

/** Mirrors SlWriteSimpleGamma (saveload.cpp) so the tests encode what the game would write. */
function writeGamma(value: number): number[] {
  const out: number[] = [];
  if (value >= 1 << 7) {
    if (value >= 1 << 14) {
      if (value >= 1 << 21) {
        if (value >= 1 << 28) {
          out.push(0xf0, (value >>> 24) & 0xff);
        } else {
          out.push(0xe0 | (value >>> 24));
        }
        out.push((value >>> 16) & 0xff);
      } else {
        out.push(0xc0 | (value >>> 16));
      }
      out.push((value >>> 8) & 0xff);
    } else {
      out.push(0x80 | (value >>> 8));
    }
  }
  out.push(value & 0xff);
  return out;
}

describe('gamma-длины', () => {
  const cases: [number, number][] = [
    [0, 1],
    [127, 1],
    [128, 2],
    [16383, 2],
    [16384, 3],
    [2097151, 3],
    [2097152, 4],
    [268435455, 4],
    [268435456, 5],
    [0xffffffff, 5],
  ];

  for (const [value, width] of cases) {
    it(`${value} занимает ${width} байт и читается обратно`, () => {
      const encoded = writeGamma(value);
      expect(encoded).toHaveLength(width);
      const reader = new ByteReader(Uint8Array.from(encoded));
      expect(reader.gamma()).toBe(value);
      expect(reader.atEnd).toBe(true);
    });
  }
});

describe('целые и строки', () => {
  it('читаются в порядке big endian', () => {
    const reader = new ByteReader(
      Uint8Array.from([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0xff]),
    );
    expect(reader.u32()).toBe(0x01020304);
    expect(reader.u16()).toBe(0x0506);
    expect(reader.u8()).toBe(0x07);
    expect(reader.i8()).toBe(0x08);
    expect(reader.i8()).toBe(-1);
  });

  it('строка идёт с gamma-длиной', () => {
    const text = 'economy.day_length_factor';
    const bytes = new TextEncoder().encode(text);
    const reader = new ByteReader(Uint8Array.from([...writeGamma(bytes.length), ...bytes]));
    expect(reader.string()).toBe(text);
  });

  it('обрыв потока — понятная ошибка, а не мусор', () => {
    const reader = new ByteReader(Uint8Array.from([0x01, 0x02]));
    expect(() => reader.u32()).toThrow(SavegameFormatError);
  });
});
