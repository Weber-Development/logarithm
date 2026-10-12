import type { AuditOutcome } from "@sweberdev/logarithm";
import type { AuditLogLabels } from "./labels";

const SYMBOL: Record<AuditOutcome, string> = { success: "✓", failure: "✕", denied: "!" };

/** @internal Shown for failed and denied events; a success is the normal case and stays quiet. */
export function OutcomeBadge({ outcome, t }: { outcome?: AuditOutcome; t: AuditLogLabels }) {
  if (!outcome || outcome === "success") return null;
  const text = outcome === "failure" ? t.outcomeFailure : t.outcomeDenied;
  return (
    <span className="lg-outcome" data-outcome={outcome}>
      <span aria-hidden="true">{SYMBOL[outcome]}</span>
      {text}
    </span>
  );
}
