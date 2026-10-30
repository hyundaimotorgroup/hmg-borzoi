/**
 * Time format utility function with timezone support
 */

type TimeValue = Date | string | number;

function toDateObject(date: TimeValue): Date {
  if (typeof date === 'string') {
    // ClickHouse returns UTC time without a timezone indicator.
    const normalized = date.includes('Z') || date.includes('+')
      ? date
      : date.includes(' ') || date.includes('T')
        ? date.replace(' ', 'T') + 'Z'
        : `${date}T00:00:00Z`;
    return new Date(normalized);
  }

  if (typeof date === 'number') {
    return new Date(date);
  }

  return date;
}

function getDateTimeParts(date: TimeValue, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(toDateObject(date));

  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '00';

  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  };
}

export function formatTimeWithTimezone(
  date: TimeValue,
  timezone: string = 'UTC',
  options: Intl.DateTimeFormatOptions = {}
): string {
  const dateObj = toDateObject(date);
  const defaultOptions: Intl.DateTimeFormatOptions = {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: timezone,
    ...options,
  };

  return dateObj.toLocaleTimeString('en-US', defaultOptions);
}

export function formatDateWithTimezone(
  date: TimeValue,
  timezone: string = 'UTC',
  options: Intl.DateTimeFormatOptions = {}
): string {
  const dateObj = toDateObject(date);
  const defaultOptions: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    timeZone: timezone,
    ...options,
  };

  return dateObj.toLocaleDateString('en-US', defaultOptions);
}

export function formatDateTimeWithTimezone(
  date: TimeValue,
  timezone: string = 'UTC',
  options: { includeSeconds?: boolean } = {}
): string {
  const { year, month, day, hour, minute, second } = getDateTimeParts(date, timezone);

  if (options.includeSeconds === false) {
    return `${year}-${month}-${day} ${hour}:${minute}`;
  }

  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}
