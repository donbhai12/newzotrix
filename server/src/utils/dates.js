const INDIA_TIME_ZONE = 'Asia/Kolkata';
const indiaDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: INDIA_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});

export function todayISO() {
  const parts = Object.fromEntries(indiaDateFormatter.formatToParts(new Date()).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function addDays(dateString, delta) {
  const d = new Date(`${dateString}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function dateRange(endDate, days) {
  const out = [];
  for (let i = days - 1; i >= 0; i--) out.push(addDays(endDate, -i));
  return out;
}

export function eligibleWorker(worker, date) {
  if (!worker || worker.status === 'Deleted') return false;
  if (worker.joining && date < worker.joining) return false;
  if (worker.stopDate && date > worker.stopDate) return false;
  return true;
}