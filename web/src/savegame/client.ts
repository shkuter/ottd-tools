/**
 * Main-thread side of savegame reading: hands the file to the worker and turns its answer
 * into the import proposal and the snapshot. The module is only imported when the player
 * actually loads a save, so neither the xz decoder nor the chunk reader weighs on the
 * initial bundle.
 */

import type { ConfirmedImport } from './apply';
import { buildImport } from './import';
import { buildSnapshot } from './snapshot';
import type { WorkerResponse } from './worker';

export class SavegameImportError extends Error {
  readonly messageKey: string;
  readonly params: Record<string, string | number>;

  constructor(messageKey: string, params: Record<string, string | number>) {
    super(messageKey);
    this.name = 'SavegameImportError';
    this.messageKey = messageKey;
    this.params = params;
  }
}

export async function importSavegame(file: File): Promise<ConfirmedImport> {
  const bytes = await file.arrayBuffer();
  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  try {
    const response = await new Promise<WorkerResponse>((resolve, reject) => {
      worker.onmessage = (event: MessageEvent<WorkerResponse>) => resolve(event.data);
      worker.onerror = (event) => reject(new Error(event.message));
      worker.postMessage({ bytes }, [bytes]);
    });
    if (!response.ok) throw new SavegameImportError(response.messageKey, response.params);
    // modelling happens here rather than in the worker: matching vehicles to the catalogue
    // needs the catalogue, and duplicating trains.json into the worker chunk costs more
    // than handing over a network that is already reduced
    return {
      proposal: buildImport(response.savegame),
      snapshot: buildSnapshot(response.savegame),
      fileName: file.name,
    };
  } finally {
    worker.terminate();
  }
}
