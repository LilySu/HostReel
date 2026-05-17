import 'server-only';

/**
 * The exact consent paragraph the guest sees on /stay/[token] before
 * starting the walkthrough. Stored as a constant so the PDF and the
 * verification page can cite the same string the guest agreed to.
 *
 * If you change this, version it — old stays should still render the old
 * paragraph on their receipts (today we don't snapshot, but that's the
 * future-proof note).
 *
 * Wording is deliberately careful: "acknowledge / confirm / record", not
 * "sign a contract / legally binding" (hard rule 24).
 */
export const CONSENT_TEXT =
  'I confirm that I will review the walkthrough recorded by my host and acknowledge each item flagged for confirmation. The timestamps, IP address, and content I acknowledge will be recorded as part of a check-in audit log shared with my host. My typed name on the final step will serve as my electronic signature confirming those acknowledgments.';
