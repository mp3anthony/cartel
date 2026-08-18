/**
 * Diagnostic logging for #42 ("JWT blank-screen recovery") — a defensive-recovery
 * batch, not a root-cause fix. The reported bug "isn't reliably reproducible," so the
 * point of this function is to make the next occurrence greppable (a consistent
 * `[cartel:<scope>]` prefix, a JSON body with a timestamp and an `isJwtShaped` flag)
 * rather than to diagnose anything now. This project has no telemetry/logging
 * service, so plain `console.error` is the proportionate choice — not a placeholder
 * for a real logging library that never got wired up.
 */
export function logDiagnostic(
  scope: string,
  subject: unknown,
  extra?: Record<string, unknown>,
): void {
  const message = subject instanceof Error ? subject.message : String(subject);
  console.error(
    `[cartel:${scope}]`,
    JSON.stringify({
      timestamp: new Date().toISOString(),
      message,
      isJwtShaped: /jwt/i.test(message),
      ...extra,
    }),
  );
}
