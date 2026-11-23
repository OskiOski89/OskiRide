// Tylko prezentacja. Wartości formularzy, obliczeń i eksportów pozostają liczbami.
const numberFormatters = new Map();

export function formatNumber(value, digits = 1) {
  if (!numberFormatters.has(digits)) {
    numberFormatters.set(digits, new Intl.NumberFormat('en-US', {
      minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: false,
    }));
  }
  return Number.isFinite(Number(value)) ? numberFormatters.get(digits).format(Number(value)) : '—';
}

export function formatTimeMMSS(seconds) {
  const absSec = Math.abs(Math.round(seconds));
  const mins = Math.floor(absSec / 60);
  const secs = absSec % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function formatWorkoutDuration(totalSeconds) {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  return seconds % 60 ? `${minutes} min ${seconds % 60} s` : `${minutes} min`;
}
