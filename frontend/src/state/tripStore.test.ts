import dayjs from 'dayjs';
import type { Place } from '../api/types';
import { parseWeight, validateTrip } from './tripStore';

const dallas: Place = {
  id: '1',
  name: 'Dallas',
  label: 'Dallas, TX',
  context: '',
  type: 'place',
  lon: -96.8,
  lat: 32.78,
};
const houston: Place = {
  id: '2',
  name: 'Houston',
  label: 'Houston, TX',
  context: '',
  type: 'place',
  lon: -95.37,
  lat: 29.76,
};
const now = dayjs('2026-01-15T12:00:00Z');
const valid = {
  origin: dallas,
  destination: houston,
  departure: now.add(1, 'hour'),
  weight: '36000',
};

describe('validateTrip', () => {
  it('accepts a complete trip', () => {
    expect(validateTrip(valid, now)).toEqual({});
  });
  it('requires both places and distinct endpoints', () => {
    expect(validateTrip({ ...valid, origin: null }, now).origin).toBeDefined();
    expect(validateTrip({ ...valid, destination: dallas }, now).destination).toMatch(/differ/);
  });
  it('allows a few minutes of slack but rejects past and far-future departures', () => {
    expect(
      validateTrip({ ...valid, departure: now.subtract(5, 'minute') }, now).departure,
    ).toBeUndefined();
    expect(validateTrip({ ...valid, departure: now.subtract(1, 'hour') }, now).departure).toMatch(
      /past/,
    );
    expect(validateTrip({ ...valid, departure: now.add(8, 'day') }, now).departure).toMatch(
      /7-day/,
    );
  });
  it.each([
    ['999', true],
    ['1000', false],
    ['80,000', false],
    ['80001', true],
    ['abc', true],
    ['', true],
  ])('weight %s invalid=%s', (weight, invalid) => {
    expect(Boolean(validateTrip({ ...valid, weight }, now).weight)).toBe(invalid);
  });
});

test('parseWeight strips separators', () => {
  expect(parseWeight('36,000')).toBe(36000);
  expect(parseWeight(' 40 000 ')).toBe(40000);
  expect(parseWeight('4e4')).toBeNull();
});
