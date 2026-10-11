import {
  formatCompass,
  formatDuration,
  formatHourOffset,
  formatMiles,
  formatMilesValue,
  formatPrecip,
  formatTempF,
  formatWeight,
  formatWind,
  joinFactors,
} from './format';

describe('formatDuration', () => {
  it.each([
    [0, '0 min'],
    [59 * 60, '59 min'],
    [3600, '1 h'],
    [3 * 3600 + 41 * 60 + 29, '3 h 41 min'],
    [3 * 3600 + 59 * 60 + 45, '4 h'],
  ])('%i s -> %s', (s, expected) => expect(formatDuration(s)).toBe(expected));
});

describe('miles', () => {
  it('uses one decimal below 100 and none above', () => {
    expect(formatMiles(12.46)).toBe('12.5 mi');
    expect(formatMiles(12)).toBe('12 mi');
    expect(formatMiles(1203.6)).toBe('1,204 mi');
  });
  it('drops trailing .0 in compact values', () => {
    expect(formatMilesValue(0)).toBe('0');
    expect(formatMilesValue(18.04)).toBe('18');
    expect(formatMilesValue(4.46)).toBe('4.5');
  });
});

describe('weather values', () => {
  it('formats wind, precipitation and temperature with placeholders for missing data', () => {
    expect(formatWind(34.6)).toBe('35 mph');
    expect(formatWind(null)).toBe('—');
    expect(formatPrecip(0)).toBe('0 in/h');
    expect(formatPrecip(0.05)).toBe('0.05 in/h');
    expect(formatPrecip(0.1)).toBe('0.1 in/h');
    expect(formatPrecip(null)).toBe('—');
    expect(formatTempF(0)).toBe('32°F');
    expect(formatTempF(null)).toBe('—');
  });
  it('maps degrees to compass points', () => {
    expect(formatCompass(0)).toBe('N');
    expect(formatCompass(44)).toBe('NE');
    expect(formatCompass(200)).toBe('S');
    expect(formatCompass(350)).toBe('N');
    expect(formatCompass(-90)).toBe('W');
    expect(formatCompass(null)).toBe('');
  });
});

describe('misc', () => {
  it('formats weights, hour offsets and factor lists', () => {
    expect(formatWeight(36000)).toBe('36,000 lb');
    expect(formatHourOffset(0)).toBe('Now');
    expect(formatHourOffset(6)).toBe('+6 h');
    expect(joinFactors([])).toBe('');
    expect(joinFactors(['wind'])).toBe('Wind');
    expect(joinFactors(['wind', 'rain', 'snow'])).toBe('Wind, Rain and Snow');
  });
});
