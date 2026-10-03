import type { Spool } from './db';

// Groups sealed spools for the Stock tab: by material, then by color within it.

export type ColorGroup = {
  key: string; // material + color, unique across the whole list
  color: string;
  count: number;
  refills: number; // how many of these are refills
  brands: { brand: string; count: number }[]; // most common first
  spools: Spool[]; // oldest purchase first, so the next one to open is on top
};

export type MaterialGroup = {
  material: string;
  count: number;
  colors: ColorGroup[];
};

// "Galaxy Black", "galaxy black " and "GALAXY BLACK" count as the same color.
const sameKey = (text: string) => text.trim().toLowerCase();

const byName = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' });

export function groupStock(spools: Spool[]): MaterialGroup[] {
  const materials = new Map<string, Spool[]>();
  for (const s of spools) {
    const list = materials.get(s.material) ?? [];
    list.push(s);
    materials.set(s.material, list);
  }

  return [...materials.entries()]
    .map(([material, list]) => ({
      material,
      count: list.length,
      colors: groupColors(material, list),
    }))
    .sort((a, b) => byName(a.material, b.material));
}

function groupColors(material: string, spools: Spool[]): ColorGroup[] {
  const colors = new Map<string, Spool[]>();
  for (const s of spools) {
    const key = sameKey(s.color);
    const list = colors.get(key) ?? [];
    list.push(s);
    colors.set(key, list);
  }

  return [...colors.entries()]
    .map(([key, list]) => {
      const sorted = [...list].sort(
        (a, b) => a.purchasedAt.localeCompare(b.purchasedAt) || a.id - b.id
      );
      return {
        key: `${material}|${key}`,
        color: displayName(sorted),
        count: list.length,
        refills: list.filter((s) => s.isRefill).length,
        brands: countBrands(list),
        spools: sorted,
      };
    })
    .sort((a, b) => byName(a.color, b.color));
}

// The spelling of a color you've typed most often ("Galaxy Black" over "galaxy black").
// On a tie, prefer one with capital letters, then the most recent.
function displayName(spools: Spool[]) {
  const counts = new Map<string, number>();
  for (const s of spools) counts.set(s.color.trim(), (counts.get(s.color.trim()) ?? 0) + 1);
  const hasCaps = (t: string) => (t !== t.toLowerCase() ? 1 : 0);
  return [...counts.entries()].reduce((best, cur) =>
    cur[1] > best[1] || (cur[1] === best[1] && hasCaps(cur[0]) >= hasCaps(best[0])) ? cur : best
  )[0];
}

function countBrands(spools: Spool[]) {
  const counts = new Map<string, number>();
  for (const s of spools) counts.set(s.brand, (counts.get(s.brand) ?? 0) + 1);
  return [...counts.entries()]
    .map(([brand, count]) => ({ brand, count }))
    .sort((a, b) => b.count - a.count || byName(a.brand, b.brand));
}
