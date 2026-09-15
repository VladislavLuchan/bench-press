import type { Row } from '@libsql/client';

/** Small accessors that turn loosely typed libsql rows into the exact types we store. */

export function text(row: Row, column: string): string | null {
  const value = row[column];
  return value === null || value === undefined ? null : String(value);
}

export function textRequired(row: Row, column: string): string {
  const value = text(row, column);
  if (value === null) throw new Error(`Column ${column} is unexpectedly NULL`);
  return value;
}

export function integer(row: Row, column: string): number | null {
  const value = row[column];
  if (value === null || value === undefined) return null;
  return Number(value);
}

export function integerRequired(row: Row, column: string): number {
  const value = integer(row, column);
  if (value === null) throw new Error(`Column ${column} is unexpectedly NULL`);
  return value;
}

export function bool(row: Row, column: string): boolean | null {
  const value = integer(row, column);
  return value === null ? null : value !== 0;
}

export function jsonArray(row: Row, column: string): string[] {
  const raw = text(row, column);
  if (raw === null) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}
