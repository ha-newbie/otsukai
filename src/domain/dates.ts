export function localDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function addDays(value: string, days: number): string {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + days);
  return localDate(date);
}
export function monday(value = localDate()): string {
  const day = new Date(`${value}T12:00:00`).getDay();
  return addDays(value, -((day + 6) % 7));
}
export function weekDates(start: string): string[] { return Array.from({ length: 7 }, (_, index) => addDays(start, index)); }
export function dateLabel(value: string): string {
  return new Date(`${value}T12:00:00`).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short' });
}
