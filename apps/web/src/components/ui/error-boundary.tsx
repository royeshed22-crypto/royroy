'use client';
import { Component, ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

interface Props {
  children: ReactNode;
  /** Shown in the fallback so the user knows which part failed. */
  label?: string;
}

interface State {
  failed: boolean;
}

/**
 * Contains a rendering failure to one section.
 *
 * Without this, a single malformed field takes the whole page down: a memory
 * record holding an object where a string was expected threw React error #31
 * and blanked an otherwise complete analysis. A section that cannot render
 * should cost the user that section, not everything around it.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    // Console only. This can carry conversation data, so it never leaves the device.
    console.error('Section failed to render:', error);
  }

  render() {
    if (!this.state.failed) return this.props.children;

    return (
      <div className="glass-card p-4 flex items-start gap-2.5">
        <AlertTriangle size={15} className="text-yellow-400/70 mt-0.5 shrink-0" />
        <div>
          <p className="text-white/70 text-sm">
            {this.props.label ?? 'This section'} could not be displayed.
          </p>
          <p className="text-white/35 text-xs mt-0.5">
            The rest of the analysis is unaffected.
          </p>
        </div>
      </div>
    );
  }
}
