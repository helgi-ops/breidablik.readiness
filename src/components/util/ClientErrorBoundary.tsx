"use client";

/**
 * Minimal client-side error boundary. Wrap any subtree that must never take the
 * whole page down when it throws (e.g. a portal-injected card on the player's
 * Today view — an uncaught render error there blanks the entire tab). On error
 * it renders `fallback` (default: nothing) instead of propagating.
 */
import { Component, type ReactNode } from "react";

export default class ClientErrorBoundary extends Component<
  { children: ReactNode; fallback?: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    // Swallow — the fallback renders in place. Logged for dev diagnostics only.
    if (process.env.NODE_ENV !== "production") console.error("[ClientErrorBoundary]", error);
  }

  render() {
    if (this.state.hasError) return this.props.fallback ?? null;
    return this.props.children;
  }
}
