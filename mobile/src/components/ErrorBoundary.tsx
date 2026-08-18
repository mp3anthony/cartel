import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Platform } from 'react-native';

import { Body, ErrorNote, Heading, PrimaryButton, Screen } from './ui';
import { logDiagnostic } from '../lib/logging';

type Props = { children: ReactNode };
type State = { error: Error | null };

/**
 * Catches any uncaught render/effect-time exception anywhere below it (e.g. a JWT
 * throw surfacing from Supabase internals) and shows a real recovery screen instead
 * of the blank page #42 reports. Matches the visual pattern Bootstrapped's own
 * session.status==='error' branch already uses (Screen/Heading/Body/ErrorNote).
 * Not a root-cause fix — see #42 / HANDOFF.md.
 */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    logDiagnostic('error-boundary', error, { componentStack: info.componentStack });
  }

  private reload = (): void => {
    if (Platform.OS === 'web') {
      window.location.reload();
      return;
    }
    // No page to reload on native, and no expo-updates dependency exists to add for
    // this defensive-only batch. Clearing the caught error at least remounts the
    // crashed subtree fresh, which is the closest native equivalent.
    this.setState({ error: null });
  };

  render(): ReactNode {
    if (this.state.error) {
      return (
        <Screen>
          <Heading>Cartel hit a snag</Heading>
          <Body>Something went wrong. Reloading has cleared this every time so far.</Body>
          <ErrorNote message={this.state.error.message} />
          <PrimaryButton label="Reload" onPress={this.reload} />
        </Screen>
      );
    }
    return this.props.children;
  }
}
