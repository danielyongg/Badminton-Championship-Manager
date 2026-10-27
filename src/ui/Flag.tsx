// Bendera negara game (SVG dari flag-icons, MIT; lihat src/assets/flags/README.md).
const FLAGS = import.meta.glob('../assets/flags/*.svg', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const URL_OF = new Map(Object.entries(FLAGS).map(([path, url]) => [path.slice(path.lastIndexOf('/') + 1, -4), url]));

/**
 * Kode negara dari id negara atau id atlet/pasangan yang diawali kode negara (`INA-…`).
 * ponytail: memakai konvensi id; atlet paket impor dengan id lain sekadar tampil tanpa bendera.
 */
export function flagCode(id: string): string | undefined {
  const code = id.split('-')[0];
  return URL_OF.has(code) ? code : undefined;
}

/** Bendera kecil di depan nama; negara tanpa bendera (dibuat di Editor) → tidak tampil. `DEN/ENG` (pasangan beda negara) → dua bendera. */
export function Flag({ id }: { id?: string | null }) {
  if (id?.includes('/')) return <>{id.split('/').map((c) => <Flag key={c} id={c} />)}</>;
  const code = id ? flagCode(id) : undefined;
  return code ? <img className="flag" src={URL_OF.get(code)} alt={code} title={code} /> : null;
}
