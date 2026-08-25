/**
 * Reads a savegame off the main thread: a big map decompresses to tens of megabytes, and
 * walking it should not freeze the interface.
 */

import { readSavegame, type RawSavegame } from './read';
import { SavegameFormatError } from './reader';

export type WorkerRequest = { bytes: ArrayBuffer };

export type WorkerResponse =
  | { ok: true; savegame: RawSavegame }
  | { ok: false; messageKey: string; params: Record<string, string | number> };

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  try {
    // the file itself never leaves this thread: what crosses back is the network already
    // reduced — cargo packets summed, unknown chunks dropped — not the map or the pools
    const savegame = await readSavegame(new Uint8Array(event.data.bytes));
    self.postMessage({ ok: true, savegame } satisfies WorkerResponse);
  } catch (error) {
    const known = error instanceof SavegameFormatError;
    self.postMessage({
      ok: false,
      messageKey: known ? error.messageKey : 'savegame.error.broken',
      params: known ? error.params : {},
    } satisfies WorkerResponse);
  }
};
