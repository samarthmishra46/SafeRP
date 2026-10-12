import type { ControlPosition, IControl } from 'maplibre-gl';
import { useEffect } from 'react';
import { useControl } from 'react-map-gl/maplibre';

const ICON_ON =
  '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M6.5 13A4.5 4.5 0 0 1 7 4.03 6 6 0 0 1 18.5 6.6 3.5 3.5 0 0 1 18 13.6V13H6.5Zm1.2 2.2.9.5-1.5 2.6-.9-.5 1.5-2.6Zm4 0 .9.5-1.5 2.6-.9-.5 1.5-2.6Zm4 0 .9.5-1.5 2.6-.9-.5 1.5-2.6Zm-6 4 .9.5-1 1.8-.9-.5 1-1.8Zm4 0 .9.5-1 1.8-.9-.5 1-1.8Z"/></svg>';
const ICON_OFF =
  '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M6.5 13A4.5 4.5 0 0 1 7 4.03 6 6 0 0 1 18.5 6.6 3.5 3.5 0 0 1 18 13.6V13H6.5Z" opacity=".45"/><path fill="currentColor" d="M3.7 2.3 21.7 20.3l-1.4 1.4L2.3 3.7l1.4-1.4Z"/></svg>';

/** A native MapLibre control button, so it sits in the map's control stack. */
class ToggleControl implements IControl {
  private container: HTMLDivElement | null = null;
  private button: HTMLButtonElement | null = null;
  private readonly onToggle: () => void;

  constructor(onToggle: () => void) {
    this.onToggle = onToggle;
  }

  onAdd(): HTMLElement {
    this.container = document.createElement('div');
    this.container.className = 'maplibregl-ctrl maplibregl-ctrl-group saferp-anim-ctrl';
    this.button = document.createElement('button');
    this.button.type = 'button';
    this.button.addEventListener('click', this.onToggle);
    this.container.appendChild(this.button);
    return this.container;
  }

  onRemove(): void {
    this.button?.removeEventListener('click', this.onToggle);
    this.container?.remove();
    this.container = null;
    this.button = null;
  }

  setEnabled(enabled: boolean): void {
    if (!this.button) return;
    const label = enabled ? 'Turn weather animations off' : 'Turn weather animations on';
    this.button.innerHTML = enabled ? ICON_ON : ICON_OFF;
    this.button.title = label;
    this.button.setAttribute('aria-label', label);
    this.button.setAttribute('aria-pressed', String(enabled));
  }
}

interface Props {
  enabled: boolean;
  onToggle: () => void;
  position?: ControlPosition;
}

export function AnimationToggleControl({ enabled, onToggle, position = 'top-right' }: Props) {
  const control = useControl(() => new ToggleControl(onToggle), { position });
  useEffect(() => control.setEnabled(enabled), [control, enabled]);
  return null;
}
