import {
  Component,
  type ComponentType,
  type ErrorInfo,
  type ReactNode,
} from 'react';

export interface ErrorFallbackProps {
  error: Error;
  resetError: () => void;
}

interface ErrorBoundaryProps {
  children: ReactNode;
  FallbackComponent?: ComponentType<ErrorFallbackProps>;
  /** Changing this clears a caught error. Pass the route to recover on navigation. */
  resetKey?: unknown;
}

interface ErrorBoundaryState {
  error: Error | null;
}

function toError(value: unknown): Error {
  if (value instanceof Error) {
    return value;
  }
  if (typeof value === 'string') {
    return new Error(value);
  }
  try {
    return new Error(JSON.stringify(value));
  } catch {
    return new Error(String(value));
  }
}

function DefaultFallback({ error, resetError }: ErrorFallbackProps) {
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-[var(--mallorca-cream,#F5F0E8)] p-6">
      <div className="w-full max-w-lg text-center">
        <p className="text-[0.68rem] font-bold uppercase tracking-[0.18em] text-[var(--mallorca-red,#D43B2B)]">
          Mallorca
        </p>
        <h1 className="mt-3 font-serif text-3xl leading-tight text-[var(--mallorca-cacao,#1C1410)]">
          Algo se nos cayó del horno.
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-[var(--mallorca-cacao,#1C1410)]/70">
          Esta vista tuvo un problema. El resto de la tienda sigue abierta: recarga o vuelve atrás.
        </p>
        {import.meta.env.DEV ? (
          <pre className="mt-4 overflow-x-auto bg-[var(--mallorca-white,#fff)] p-3 text-left text-xs text-[var(--mallorca-cacao,#1C1410)]/80">
            {error.message || String(error)}
          </pre>
        ) : null}
        <button
          type="button"
          onClick={resetError}
          className="mt-6 bg-[var(--mallorca-red,#D43B2B)] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[var(--mallorca-red-dark,#b83228)]"
        >
          Intentar de nuevo
        </button>
      </div>
    </div>
  );
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { error: toError(error) };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error(
      'ErrorBoundary caught an error:',
      toError(error),
      info.componentStack,
    );
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps): void {
    if (
      this.state.error !== null &&
      prevProps.resetKey !== this.props.resetKey
    ) {
      this.resetError();
    }
  }

  resetError = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (error === null) {
      return this.props.children;
    }
    const Fallback = this.props.FallbackComponent ?? DefaultFallback;
    return <Fallback error={error} resetError={this.resetError} />;
  }
}
