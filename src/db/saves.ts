import Dexie, { type Table } from 'dexie';
import type { DataPack } from '../engine/pack';
import { t } from '../i18n';
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

/** Isi file ekspor save: meta + isi lengkap. Untuk memindah karier antarperangkat/peramban (web app iOS terpisah dari Safari). */
export interface SaveFile { bcmSave: 1; meta: SaveMeta; blob: SaveBlob }

export async function exportSave(meta: SaveMeta): Promise<SaveFile | undefined> {
  const blob = await readSave(meta.id);
  return blob && { bcmSave: 1, meta, blob };
}

/** Simpan file ekspor sebagai slot baru (id baru → tak menimpa save yang ada). Save lama dimigrasi saat dimuat (gameFromBlob). */
export async function importSave(data: unknown): Promise<SaveMeta> {
  const f = data as Partial<SaveFile> | null;
  const b = f?.blob;
  if (f?.bcmSave !== 1 || !f.meta?.name || !b?.state?.players || !b.ruleset || !b.world || typeof b.rngState !== 'number')
    throw new Error(t('notSaveFile'));
  const id = crypto.randomUUID();
  const meta = { ...f.meta, id };
  await writeSave(meta, { ...b, id });
  return meta;
}
