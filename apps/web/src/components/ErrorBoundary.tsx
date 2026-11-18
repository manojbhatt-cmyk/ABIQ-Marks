import { AlertTriangle } from "lucide-react";
import { Component, ReactNode } from "react";

/** Keeps one broken screen from blanking the whole app: shows the error with a retry; resets when the page changes. */
export default class ErrorBoundary extends Component<{ children: ReactNode; resetKey: string }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidUpdate(prev: { resetKey: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="card flex items-start gap-3 p-6 text-sm">
        <AlertTriangle className="mt-0.5 text-danger-700" />
        <div className="flex-1">
          <div className="font-semibold">This screen hit an error</div>
          <div className="mt-1 font-mono text-xs text-slate-500">{this.state.error.message}</div>
          <div className="mt-2 text-slate-500">The rest of ABIQ still works. Try again, or open another screen from the menu.</div>
        </div>
        <button className="btn-secondary" onClick={() => this.setState({ error: null })}>Try again</button>
      </div>
    );
  }
}
