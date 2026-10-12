import Dexie, { type Table } from 'dexie';
import type { DataPack } from '../engine/pack';
import type { SeasonState } from '../engine/season';
import type { Ruleset, SaveMeta, World } from '../engine/types';

// Penyimpanan lokal (IndexedDB lewat Dexie). Daftar slot (`saves`) terpisah dari isi lengkap (`blobs`)
// agar layar Load cepat walau isi save besar.

export interface SaveBlob {
  id: string;
  state: SeasonState;
  ruleset: Ruleset; // salinan ruleset milik save ini (bisa diedit tanpa memengaruhi save lain)
  world: World;
  rngState: number;
}

class Db extends Dexie {
  saves!: Table<SaveMeta, string>;
  blobs!: Table<SaveBlob, string>;
  packs!: Table<DataPack, string>; // paket data buatan sendiri (Editor / impor)
  constructor() {
    super('bcm');
    this.version(1).stores({ saves: 'id, updatedAt', blobs: 'id' });
    this.version(2).stores({ saves: 'id, updatedAt', blobs: 'id', packs: 'id, updatedAt' });
  }
}

export const db = new Db();

export async function writeSave(meta: SaveMeta, blob: SaveBlob) {
  await db.transaction('rw', db.saves, db.blobs, async () => {
    await db.saves.put({ ...meta, updatedAt: Date.now() });
    await db.blobs.put(blob);
  });
}

export const listSaves = () => db.saves.orderBy('updatedAt').reverse().toArray();
export const readSave = (id: string) => db.blobs.get(id);

export const listPacks = () => db.packs.orderBy('updatedAt').reverse().toArray();
export const writePack = (p: DataPack) => db.packs.put({ ...p, updatedAt: Date.now() });
export const deletePack = (id: string) => db.packs.delete(id);

export async function deleteSave(id: string) {
  await db.transaction('rw', db.saves, db.blobs, async () => {
    await db.saves.delete(id);
    await db.blobs.delete(id);
  });
}
