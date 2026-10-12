import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useUi } from '../state/uiStore';
import { makeHeatmap, makePlan } from '../test/fixtures';
import { renderWithProviders } from '../test/render';
import { TimelineBar } from './TimelineBar';

// Plan fixture departs 2026-01-15T12:00Z; anchor two hours earlier.
const ANCHOR = '2026-01-15T10:00:00Z';

function setup() {
  useUi.setState({ heatHour: 0, playing: false, playSpeed: 1, selectedRouteId: 'B' });
  renderWithProviders(
    <TimelineBar
      plan={makePlan()}
      heatmap={makeHeatmap(ANCHOR)}
      loading={false}
      error={null}
      onRetry={() => {}}
      anchorMs={Date.parse(ANCHOR)}
      compact={false}
    />,
  );
  return screen.getByRole('slider', { name: 'Forecast hour' });
}

describe('TimelineBar', () => {
  it('steps one hour with arrows and jumps to the ends with Home/End', async () => {
    const slider = setup();
    slider.focus();
    await userEvent.keyboard('{ArrowRight}{ArrowRight}');
    expect(useUi.getState().heatHour).toBe(2);
    await userEvent.keyboard('{ArrowLeft}');
    expect(useUi.getState().heatHour).toBe(1);
    await userEvent.keyboard('{End}');
    expect(useUi.getState().heatHour).toBe(48);
    await userEvent.keyboard('{Home}');
    expect(useUi.getState().heatHour).toBe(0);
    // Local time: a whole UTC hour need not be :00 locally (e.g. UTC+5:30).
    expect(slider).toHaveAttribute(
      'aria-valuetext',
      expect.stringMatching(/^Now, \w{3} \d\d:\d\d$/),
    );
  });

  it('jumps to the departure hour', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: /Departure/ }));
    expect(useUi.getState().heatHour).toBe(2);
    expect(screen.getByText('+2 h')).toBeInTheDocument();
  });

  it('switches playback speed', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: '4 times speed' }));
    expect(useUi.getState().playSpeed).toBe(4);
  });

  it('marks departure and arrival and describes the hazard timeline', () => {
    setup();
    expect(screen.getByRole('img', { name: /^Departure \w{3} \d\d:\d\d$/ })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /^Arrival / })).toBeInTheDocument();
    // Route B (selected) has a Moderate checkpoint.
    expect(
      screen.getByRole('img', { name: /Hazard timeline. Route B: worst risk Moderate/ }),
    ).toBeInTheDocument();
  });

  it('explains that the slider never changes the recommendation', () => {
    setup();
    expect(screen.getByText(/Route risk uses each checkpoint's ETA forecast/)).toBeInTheDocument();
  });
});
