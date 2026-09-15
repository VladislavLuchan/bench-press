import { describe, expect, it } from 'vitest';
import { parseSalary, salaryMaxInUsd } from '../../src/lib/parse-salary.ts';

describe('parseSalary', () => {
  it('reads a dollar range', () => {
    expect(parseSalary('$3000-5000')).toEqual({ min: 3000, max: 5000, currency: 'USD' });
  });

  it('reads thousands with separators and a currency word', () => {
    expect(parseSalary('від 4 000 до 6 000 USD')).toEqual({ min: 4000, max: 6000, currency: 'USD' });
  });

  it('expands k suffixes', () => {
    expect(parseSalary('3.5k-5k €')).toEqual({ min: 3500, max: 5000, currency: 'EUR' });
  });

  it('returns null when there is no amount', () => {
    expect(parseSalary('competitive')).toBeNull();
    expect(parseSalary(null)).toBeNull();
  });

  it('ignores implausible numbers such as years', () => {
    expect(parseSalary('3+ years')).toBeNull();
  });

  it('converts hryvnia to dollars for the floor check', () => {
    const salary = parseSalary('82 000 грн');
    expect(salary?.currency).toBe('UAH');
    expect(salaryMaxInUsd(salary!)).toBeCloseTo(2000, 0);
  });
});
