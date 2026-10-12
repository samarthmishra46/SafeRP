import { countries, countryName } from './countries';
import { UNITS, WEIGHT_RANGE, unitSystemFor, weightFromLb, weightToLb } from './units';

describe('unit systems', () => {
  it.each([
    ['US', 'imperial'],
    ['PR', 'imperial'],
    ['GB', 'uk'],
    ['CA', 'metric'],
    ['DE', 'metric'],
    ['IN', 'metric'],
    ['', 'metric'], // worldwide
  ])('%s -> %s', (country, system) => expect(unitSystemFor(country)).toBe(system));
});

describe('weight', () => {
  it('round-trips between kg and lb', () => {
    expect(weightFromLb(80_000, UNITS.metric)).toBeCloseTo(36_287.4, 1);
    expect(weightToLb(weightFromLb(36_000, UNITS.metric), UNITS.metric)).toBeCloseTo(36_000, 6);
    expect(weightFromLb(36_000, UNITS.imperial)).toBe(36_000);
  });
  it('keeps the kg limits inside the 1,000–80,000 lb range of the brief', () => {
    const [min, max] = WEIGHT_RANGE.kg;
    expect(weightToLb(min, UNITS.metric)).toBeGreaterThanOrEqual(1_000);
    expect(Math.round(weightToLb(max, UNITS.metric))).toBeLessThanOrEqual(80_000);
  });
});

describe('countries', () => {
  it('lists worldwide first, then every country by name', () => {
    const list = countries();
    expect(list[0]).toEqual({ code: '', name: 'Worldwide (all countries)' });
    expect(list.length).toBeGreaterThan(240);
    expect(countryName('DE')).toBe('Germany');
    expect(list.slice(1).map((c) => c.name)).toEqual(
      [...list.slice(1).map((c) => c.name)].sort((a, b) => a.localeCompare(b)),
    );
  });
});
