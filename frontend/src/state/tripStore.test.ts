import dayjs from 'dayjs';
import type { Place } from '../api/types';
import {
  REST_PRESETS,
  parseWeight,
  toPlanRequest,
  toRestPlan,
  useTrip,
  validateRest,
  validateTrip,
} from './tripStore';

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

describe('rest settings', () => {
  const base = {
    enabled: true,
    breaksOn: true,
    breakEveryH: '8',
    breakMin: '30',
    overnightOn: true,
    overnightAfterH: '11',
    overnightH: '10',
  };

  it('builds an optional rest plan with only the parts switched on', () => {
    expect(toRestPlan({ ...base, enabled: false })).toBeNull();
    expect(toRestPlan({ ...base, breaksOn: false, overnightOn: false })).toBeNull();
    expect(toRestPlan(base)).toEqual({
      breaks: { everyH: 8, minutes: 30 },
      overnight: { afterDrivingH: 11, hours: 10 },
    });
    expect(toRestPlan({ ...base, breaksOn: false, breakEveryH: 'x' })).toEqual({
      breaks: null,
      overnight: { afterDrivingH: 11, hours: 10 },
    });
  });

  it('only range-checks parts that are switched on, and enforces no legal rule', () => {
    expect(validateRest({ ...base, breakEveryH: '2.5', breakMin: '10' })).toEqual({});
    expect(validateRest({ ...base, breakEveryH: '0.1' }).breakEveryH).toBeDefined();
    expect(validateRest({ ...base, overnightH: 'abc' }).overnightH).toBeDefined();
    expect(validateRest({ ...base, overnightOn: false, overnightH: 'abc' })).toEqual({});
    expect(validateRest({ ...base, enabled: false, breakMin: '0' })).toEqual({});
  });

  it('presets fill values and switch parts on or off', () => {
    const eu = REST_PRESETS.find((p) => p.id === 'eu')!;
    useTrip.getState().applyRestPreset(eu);
    expect(useTrip.getState().rest).toMatchObject({
      breaksOn: true,
      breakEveryH: '4.5',
      breakMin: '45',
      overnightAfterH: '9',
      overnightH: '11',
    });
    useTrip.getState().applyRestPreset(REST_PRESETS.find((p) => p.id === 'ca')!);
    expect(useTrip.getState().rest.breaksOn).toBe(false);
  });
});

describe('country and units', () => {
  afterEach(() => useTrip.getState().setCountry('US'));

  it('converts the typed load when the weight unit changes', () => {
    useTrip.setState({ country: 'US', weight: '36000' });
    useTrip.getState().setCountry('DE');
    expect(useTrip.getState().weight).toBe('16329');
    useTrip.getState().setCountry('FR'); // same unit: unchanged
    expect(useTrip.getState().weight).toBe('16329');
    useTrip.getState().setCountry('US');
    expect(useTrip.getState().weight).toBe('35999');
  });

  it('validates the load in the country unit', () => {
    const base = { origin: dallas, destination: houston, departure: now.add(1, 'hour') };
    expect(validateTrip({ ...base, weight: '40000', country: 'DE' }, now).weight).toMatch(
      /454 and 36,287 kg/,
    );
    expect(validateTrip({ ...base, weight: '16000', country: 'DE' }, now)).toEqual({});
  });

  it('sends pounds and the distance unit to the API', () => {
    useTrip.setState({
      country: 'DE',
      weight: '16000',
      origin: dallas,
      destination: houston,
      departure: now.add(1, 'hour'),
    });
    const req = toPlanRequest(useTrip.getState());
    expect(req.weightLb).toBe(35274);
    expect(req.distanceUnit).toBe('km');
  });
});
