import { Alert, AlertTitle, Box } from '@mui/material';
import { Component, type ReactNode } from 'react';

interface State {
  failed: boolean;
}

/** Keeps the planner usable if the map cannot start (e.g. WebGL disabled). */
export class MapErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', p: 3 }}>
        <Alert severity="warning" sx={{ maxWidth: 420 }}>
          <AlertTitle>The map could not be displayed</AlertTitle>
          Your browser may have WebGL turned off. Route cards and recommendations still work.
        </Alert>
      </Box>
    );
  }
}
