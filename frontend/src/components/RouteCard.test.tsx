import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useUi } from '../state/uiStore';
import { makeRoute } from '../test/fixtures';
import { renderWithProviders } from '../test/render';
import { RouteCard } from './RouteCard';

describe('RouteCard', () => {
  it('shows the recommended badge, stats and miles per level', () => {
    const route = makeRoute('A', [0, 3, 3, 0, 0]);
    renderWithProviders(<RouteCard route={route} recommended selected onSelect={() => {}} />);
    expect(screen.getByText('Route A')).toBeInTheDocument();
    expect(screen.getByText('Recommended')).toBeInTheDocument();
    expect(screen.getByText('Worst: Severe')).toBeInTheDocument();
    expect(screen.getByText('100 mi', { selector: 'div' })).toBeInTheDocument(); // distance stat
    expect(screen.getByText('3 h')).toBeInTheDocument();
    expect(screen.getByLabelText('Severe: 50 miles')).toBeInTheDocument();
    expect(screen.getByLabelText('Low: 50 miles')).toBeInTheDocument();
  });

  it('selects the route when its header is activated', async () => {
    const onSelect = vi.fn();
    renderWithProviders(
      <RouteCard
        route={makeRoute('B', [0, 0])}
        recommended={false}
        selected={false}
        onSelect={onSelect}
      />,
    );
    const button = screen.getByRole('button', { name: /Route B/ });
    expect(button).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(button);
    expect(onSelect).toHaveBeenCalledWith('B');
  });
});

describe('RiskStrip keyboard', () => {
  it('steps through checkpoints with arrow keys and pins with Enter', async () => {
    useUi.setState({ hovered: null, pinned: null });
    const route = makeRoute('A', [0, 2, 4]);
    renderWithProviders(
      <RouteCard route={route} recommended={false} selected onSelect={() => {}} />,
    );
    const strip = screen.getByRole('group', { name: /Risk along Route A/ });
    strip.focus();
    await userEvent.keyboard('{ArrowRight}{ArrowRight}');
    expect(useUi.getState().hovered).toMatchObject({ routeId: 'A', index: 1, source: 'strip' });
    expect(screen.getByText(/Mile 25, ETA .*: High \(wind\)/)).toBeInTheDocument();
    await userEvent.keyboard('{End}{Enter}');
    expect(useUi.getState().pinned).toEqual({ routeId: 'A', index: 2 });
    await userEvent.keyboard('{Escape}');
    expect(useUi.getState().pinned).toBeNull();
  });
});
