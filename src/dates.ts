const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// "Oct 3, 2026" for date-only entries, "Oct 3, 2026 · 4:12 PM" when a time is known.
export function formatWhen(at: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(at)) {
    const [y, m, d] = at.split('-').map(Number);
    return `${MONTHS[m - 1]} ${d}, ${y}`;
  }
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return at;
  const h = d.getHours();
  const time = `${h % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()} · ${time}`;
}
