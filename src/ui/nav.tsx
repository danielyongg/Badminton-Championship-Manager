import { createContext, useContext, type ReactNode } from 'react';

// Navigasi global di layar karier: nama atlet/pasangan → profil, nama turnamen → halaman turnamen, dari halaman mana pun.

/** `known`: id atlet / pasangan yang punya profil (negara di beregu tidak). */
export const NavContext = createContext<{ player?: (id: string) => void; event?: (id: string, year: number) => void; known?: (id: string) => boolean }>({});
export const useNav = () => useContext(NavContext);

const link = (go: () => void, children: ReactNode, className?: string, before?: () => void) => (
  <a href="#" className={className} onClick={(e) => { e.preventDefault(); e.stopPropagation(); before?.(); go(); }}>{children}</a>
);

/** Nama atlet / pasangan (id peserta) yang bisa diklik ke profil; di luar karier (Lab, Editor) teks biasa. `before`: mis. kecilkan pop-up. */
export function PlayerName({ id, children, className, before }: { id: string; children: ReactNode; className?: string; before?: () => void }) {
  const nav = useNav();
  return nav.player && nav.known?.(id) !== false ? link(() => nav.player!(id), children, className, before) : <span className={className}>{children}</span>;
}

/** Nama turnamen yang bisa diklik ke halaman turnamen (tahun itu). */
export function EventName({ id, year, children, className }: { id: string; year: number; children: ReactNode; className?: string }) {
  const nav = useNav();
  return nav.event ? link(() => nav.event!(id, year), children, className) : <span className={className}>{children}</span>;
}
