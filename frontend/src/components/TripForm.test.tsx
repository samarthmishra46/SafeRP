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
