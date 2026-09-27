// Small date-math helpers. Kept dependency-free (no date-fns/dayjs) since
// the rest of the project doesn't use one. All functions return a new
// Date and never mutate their input.

export function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function addMonths(date, months) {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

export function addYears(date, years) {
  const result = new Date(date);
  result.setFullYear(result.getFullYear() + years);
  return result;
}

// Given a budget's period ('weekly' | 'monthly' | 'yearly') and start_date,
// returns the implied end date used for progress calculations when the
// budget has no explicit end_date. Not written to the DB — computed
// on read only.
export function computePeriodEnd(startDate, period) {
  const start = new Date(startDate);

  switch (period) {
    case "weekly":
      return addDays(start, 7);
    case "yearly":
      return addYears(start, 1);
    case "monthly":
    default:
      return addMonths(start, 1);
  }
}
