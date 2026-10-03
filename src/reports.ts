import type { Spool } from './db';

// Plain calculations behind the Reports tab. They take a list of spools and
// return numbers, so they're easy to change without touching any screens.

export type MonthTotal = {
  key: string; // "2026-10"
  label: string; // "Oct"
  year: number;
  spent: number;
  count: number;
};

export type GroupTotal = {
  name: string;
  spent: number;
  count: number;
  grams: number;
  pricePerKg: number;
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function monthName(key: string) {
  const [y, m] = key.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

export function sumSpent(spools: Spool[]) {
  return spools.reduce((sum, s) => sum + s.pricePaid, 0);
}

// Average price per kilogram across these spools (total paid / total filament).
export function pricePerKg(spools: Spool[]) {
  const grams = spools.reduce((sum, s) => sum + s.totalWeightG, 0);
  return grams > 0 ? (sumSpent(spools) / grams) * 1000 : 0;
}

// Spools bought in a year, or a year + month (month is 1–12).
export function boughtIn(spools: Spool[], year: number, month?: number) {
  const prefix = month ? `${year}-${String(month).padStart(2, '0')}` : `${year}-`;
  return spools.filter((s) => s.purchasedAt.startsWith(prefix));
}

// Spending for each of the last `count` months, oldest first, including empty months.
export function monthlyTotals(spools: Spool[], count = 12, now = new Date()): MonthTotal[] {
  const months: MonthTotal[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    months.push({
      key,
      label: MONTHS[d.getMonth()],
      year: d.getFullYear(),
      spent: 0,
      count: 0,
    });
  }
  const byKey = new Map(months.map((m) => [m.key, m]));
  for (const s of spools) {
    const m = byKey.get(s.purchasedAt.slice(0, 7));
    if (m) {
      m.spent += s.pricePaid;
      m.count += 1;
    }
  }
  return months;
}

// Totals grouped by something about a spool (its brand, material…), biggest spend first.
export function groupTotals(spools: Spool[], keyOf: (s: Spool) => string): GroupTotal[] {
  const groups = new Map<string, Spool[]>();
  for (const s of spools) {
    const key = keyOf(s);
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }
  return [...groups.entries()]
    .map(([name, list]) => ({
      name,
      spent: sumSpent(list),
      count: list.length,
      grams: list.reduce((sum, s) => sum + s.totalWeightG, 0),
      pricePerKg: pricePerKg(list),
    }))
    .sort((a, b) => b.spent - a.spent || b.count - a.count);
}
