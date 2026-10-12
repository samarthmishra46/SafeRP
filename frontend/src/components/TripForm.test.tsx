import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useTrip } from '../state/tripStore';
import { renderWithProviders } from '../test/render';
import { TripForm } from './TripForm';

describe('TripForm', () => {
  beforeEach(() =>
    useTrip.setState({ origin: null, destination: null, weight: '36000', interval: 25 }),
  );

  it('shows inline errors instead of submitting an incomplete trip', async () => {
    const onSubmit = vi.fn();
    renderWithProviders(<TripForm onSubmit={onSubmit} pending={false} />);
    await userEvent.click(screen.getByRole('button', { name: 'Plan routes' }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('Choose a starting point.')).toBeInTheDocument();
    expect(screen.getByText('Choose a destination.')).toBeInTheDocument();
  });

  it('applies weight presets and interval choice', async () => {
    renderWithProviders(<TripForm onSubmit={() => {}} pending={false} />);
    await userEvent.click(screen.getByRole('button', { name: /Heavy · 45k/ }));
    expect(useTrip.getState().weight).toBe('45000');
    await userEvent.click(screen.getByRole('button', { name: '10 miles' }));
    expect(useTrip.getState().interval).toBe(10);
  });
});

describe('TripForm rest stops', () => {
  it('reveals optional rest settings when ticked', async () => {
    useTrip.setState({ rest: { ...useTrip.getState().rest, enabled: false } });
    renderWithProviders(<TripForm onSubmit={() => {}} pending={false} />);
    expect(screen.queryByRole('group', { name: 'Rest stop settings' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('checkbox', { name: /Plan rest stops/ }));
    expect(screen.getByRole('group', { name: 'Rest stop settings' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('switch', { name: /Overnight rest/ }));
    expect(useTrip.getState().rest.overnightOn).toBe(false);
    await userEvent.click(screen.getByRole('button', { name: 'US' }));
    expect(useTrip.getState().rest).toMatchObject({ breakEveryH: '8', overnightOn: true });
  });
});
