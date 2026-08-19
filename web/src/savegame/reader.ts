/**
 * Byte reader for the decompressed savegame stream.
 *
 * Every primitive follows OpenTTD's own saveload code (src/saveload/saveload.cpp): integers
 * are big endian, and lengths use the variable-width "simple gamma" encoding whose leading
 * bits say how many bytes follow (SlReadSimpleGamma).
 */

/**
 * Raised when a file cannot be read as a savegame. The message states the technical reason
 * for logs, while `messageKey` and `params` carry what the UI shows the user — the reader
 * itself never touches i18n.
 */
export class SavegameFormatError extends Error {
  readonly messageKey: string;
  readonly params: Record<string, string | number>;

  constructor(
    message: string,
    messageKey = 'savegame.error.broken',
    params: Record<string, string | number> = {},
  ) {
    super(message);
    this.name = 'SavegameFormatError';
    this.messageKey = messageKey;
    this.params = params;
  }
}

export class ByteReader {
  private readonly view: DataView;
  private readonly data: Uint8Array;
  private pos = 0;

  constructor(data: Uint8Array) {
    this.data = data;
    this.view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  }

  get offset(): number {
    return this.pos;
  }

  get size(): number {
    return this.data.length;
  }

  get atEnd(): boolean {
    return this.pos >= this.data.length;
  }

  private require(count: number): number {
    const at = this.pos;
    if (at + count > this.data.length) {
      throw new SavegameFormatError(
        `savegame ends mid-value: needed ${count} byte(s) at ${at} of ${this.data.length}`,
      );
    }
    this.pos = at + count;
    return at;
  }

  u8(): number {
    return this.view.getUint8(this.require(1));
  }

  i8(): number {
    return this.view.getInt8(this.require(1));
  }

  u16(): number {
    return this.view.getUint16(this.require(2));
  }

  i16(): number {
    return this.view.getInt16(this.require(2));
  }

  u32(): number {
    return this.view.getUint32(this.require(4));
  }

  i32(): number {
    return this.view.getInt32(this.require(4));
  }

  u64(): bigint {
    return this.view.getBigUint64(this.require(8));
  }

  i64(): bigint {
    return this.view.getBigInt64(this.require(8));
  }

  /**
   * Variable-width length. The leading ones of the first byte count the extra bytes:
   * 0xxxxxxx is one byte, 10xxxxxx two, 110xxxxx three, 1110xxxx four, and 11110000 marks a
   * five-byte value whose payload is the four bytes that follow.
   */
  gamma(): number {
    let i = this.u8();
    if (i & 0x80) {
      i &= ~0x80;
      if (i & 0x40) {
        i &= ~0x40;
        if (i & 0x20) {
          i &= ~0x20;
          if (i & 0x10) {
            i &= ~0x10;
            if (i & 0x08) throw new SavegameFormatError('unsupported gamma length');
            i = this.u8();
          }
          i = (i << 8) | this.u8();
        }
        i = (i << 8) | this.u8();
      }
      i = (i << 8) | this.u8();
    }
    // shifting past bit 31 turns negative in JS, so fold the sign back for 4 GB-scale values
    return i >>> 0;
  }

  /** Raw slice of the underlying buffer; no copy, so it stays valid as long as the stream. */
  take(count: number): Uint8Array {
    const at = this.require(count);
    return this.data.subarray(at, at + count);
  }

  skip(count: number): void {
    this.require(count);
  }

  /** Length-prefixed UTF-8 string, as SlStdString writes it. */
  string(): string {
    return DECODER.decode(this.take(this.gamma()));
  }
}

const DECODER = new TextDecoder();
