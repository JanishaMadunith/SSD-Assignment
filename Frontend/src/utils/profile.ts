export function loadStoredJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') {
    return fallback;
  }

  const raw = window.localStorage.getItem(key);
  if (!raw) {
    return fallback;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function saveStoredJson<T>(key: string, value: T) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(key, JSON.stringify(value));
}

export function splitAddress(address?: string | null) {
  const [street_address = '', city = '', district = '', postal_code = ''] = (address || '')
    .split(',')
    .map((segment) => segment.trim());

  return { street_address, city, district, postal_code };
}

export function joinAddress(parts: {
  street_address?: string;
  city?: string;
  district?: string;
  postal_code?: string;
}) {
  return [parts.street_address, parts.city, parts.district, parts.postal_code]
    .map((segment) => (segment || '').trim())
    .filter(Boolean)
    .join(', ');
}

export function toStringArray(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  if (typeof value === 'string') {
    return value.split(',').map((item) => item.trim()).filter(Boolean);
  }

  return [];
}

export function completionPercent(values: Record<string, unknown>, keys: string[]) {
  if (keys.length === 0) {
    return 100;
  }

  const filled = keys.filter((key) => {
    const value = values[key];

    if (Array.isArray(value)) {
      return value.length > 0;
    }

    if (typeof value === 'boolean') {
      return true;
    }

    return value !== null && value !== undefined && String(value).trim() !== '';
  }).length;

  return Math.round((filled / keys.length) * 100);
}

export function formatTimestamp(value?: string | null) {
  if (!value) {
    return 'Just now';
  }

  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}