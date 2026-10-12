import {
  formatCompass,
  formatDistance,
  formatDistanceValue,
  formatDuration,
  formatHourOffset,
  formatInterval,
  formatMilepost,
  formatRain,
  formatSnow,
  formatTemperature,
  formatWeight,
  formatWind,
  joinFactors,
} from './format';
import { UNITS } from './units';

describe('formatDuration', () => {
  it.each([
    [0, '0 min'],
    [59 * 60, '59 min'],
    [3600, '1 h'],
    [3 * 3600 + 41 * 60 + 29, '3 h 41 min'],
    [3 * 3600 + 59 * 60 + 45, '4 h'],
  ])('%i s -> %s', (s, expected) => expect(formatDuration(s)).toBe(expected));
});

const US = UNITS.imperial;
const METRIC = UNITS.metric;
const UK = UNITS.uk;

describe('distance', () => {
  it('uses one decimal below 100 and none above', () => {
    expect(formatDistance(12.46, US)).toBe('12.5 mi');
    expect(formatDistance(12, US)).toBe('12 mi');
    expect(formatDistance(1203.6, US)).toBe('1,204 mi');
  });
  it('converts to kilometres for metric countries', () => {
    expect(formatDistance(25, METRIC)).toBe('40.2 km');
    expect(formatDistance(969, METRIC)).toBe('1,559 km');
    expect(formatDistance(25, UK)).toBe('25 mi'); // UK roads use miles
  });
  it('drops trailing .0 in compact values and labels positions', () => {
    expect(formatDistanceValue(0, US)).toBe('0');
    expect(formatDistanceValue(18.04, US)).toBe('18');
    expect(formatDistanceValue(4.46, US)).toBe('4.5');
    expect(formatMilepost(25, US)).toBe('mile 25');
    expect(formatMilepost(25, METRIC)).toBe('km 40.2');
    expect(formatInterval(25, US)).toBe('25 mi');
    expect(formatInterval(10, METRIC)).toBe('16 km');
    expect(formatInterval(50, METRIC)).toBe('80 km');
  });
});

describe('weather values', () => {
  it('formats US units with placeholders for missing data', () => {
    expect(formatWind(34.6, US)).toBe('35 mph');
    expect(formatWind(null, US)).toBe('—');
    expect(formatRain(0, US)).toBe('0 in/h');
    expect(formatRain(0.05, US)).toBe('0.05 in/h');
    expect(formatRain(0.1, US)).toBe('0.1 in/h');
    expect(formatRain(null, US)).toBe('—');
    expect(formatSnow(1, US)).toBe('1 in/h');
    expect(formatTemperature(0, US)).toBe('32°F');
    expect(formatTemperature(null, US)).toBe('—');
  });
  it('formats metric units', () => {
    expect(formatWind(25, METRIC)).toBe('40 km/h');
    expect(formatWind(25, UK)).toBe('25 mph');
    expect(formatRain(0.1, METRIC)).toBe('2.5 mm/h');
    expect(formatSnow(1, METRIC)).toBe('2.5 cm/h');
    expect(formatTemperature(21.4, METRIC)).toBe('21°C');
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
    expect(formatWeight(36000, US)).toBe('36,000 lb');
    expect(formatWeight(36000, METRIC)).toBe('16,329 kg');
    expect(formatHourOffset(0)).toBe('Now');
    expect(formatHourOffset(6)).toBe('+6 h');
    expect(joinFactors([])).toBe('');
    expect(joinFactors(['wind'])).toBe('Wind');
    expect(joinFactors(['wind', 'rain', 'snow'])).toBe('Wind, Rain and Snow');
  });
});
