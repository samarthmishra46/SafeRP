import { boundsOf, positionAtElapsed } from './geo';

const route = {
  geometry: [
    [0, 0],
    [1, 0],
    [1, 2],
  ] as [number, number][],
  // 10 minutes to the corner, then 30 minutes north.
  cumDurationS: [0, 600, 2400],
};

describe('positionAtElapsed', () => {
  it('interpolates within the segment that contains the time', () => {
    expect(positionAtElapsed(route, 300)).toEqual([0.5, 0]);
    expect(positionAtElapsed(route, 600)).toEqual([1, 0]);
    expect(positionAtElapsed(route, 1500)).toEqual([1, 1]);
    expect(positionAtElapsed(route, 2400)).toEqual([1, 2]);
  });
  it('returns null before departure and after arrival', () => {
    expect(positionAtElapsed(route, -1)).toBeNull();
    expect(positionAtElapsed(route, 2401)).toBeNull();
  });
});

test('boundsOf', () => {
  expect(boundsOf(route.geometry)).toEqual([
    [0, 0],
    [1, 2],
  ]);
  expect(boundsOf([])).toBeNull();
});
