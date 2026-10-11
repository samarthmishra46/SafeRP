import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useUi } from '../state/uiStore';
import { makePlan } from '../test/fixtures';
import { renderWithProviders } from '../test/render';
import { NoTravelBanner } from './Banners';
import { Results } from './Results';

describe('Results', () => {
  it('lists routes in rank order with the reason and ranking table', () => {
    useUi.setState({ selectedRouteId: 'B' });
    renderWithProviders(<Results plan={makePlan()} onUseDeparture={() => {}} />);
    expect(screen.getByText('Take Route B')).toBeInTheDocument();
    expect(screen.getByText(/0 Severe miles vs 50 on Route A/)).toBeInTheDocument();
    const cards = screen.getAllByTestId('route-card');
    expect(within(cards[0]).getByText('Route B')).toBeInTheDocument();
    const table = screen.getByRole('table', { name: 'Route ranking comparison' });
    const rows = within(table).getAllByRole('row');
    expect(within(rows[1]).getByText('Route B')).toBeInTheDocument();
    expect(within(rows[1]).getByLabelText('Recommended')).toBeInTheDocument();
    // Severe is the deciding column between B and A.
    expect(within(rows[0]).getByText('Severe')).toHaveStyle({ fontWeight: '700' });
  });
});

describe('NoTravelBanner', () => {
  it('offers the suggested later departure', async () => {
    const plan = makePlan();
    plan.routes[1].summary.miles.noTravel = 12;
    plan.recommendation.notRecommended = true;
    plan.recommendation.suggestion = {
      departure: '2026-01-15T15:00:00Z',
      shiftHours: 3,
      routeId: 'B',
    };
    const onUse = vi.fn();
    renderWithProviders(<NoTravelBanner plan={plan} onUseDeparture={onUse} />);
    expect(screen.getByText('Not recommended at this departure time')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('crosses No Travel conditions for 12 mi');
    await userEvent.click(screen.getByRole('button', { name: 'Use 3 h later' }));
    expect(onUse).toHaveBeenCalledWith('2026-01-15T15:00:00Z');
  });

  it('renders nothing when the trip is fine', () => {
    const { container } = renderWithProviders(
      <NoTravelBanner plan={makePlan()} onUseDeparture={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
