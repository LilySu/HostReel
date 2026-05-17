import 'server-only';
import { createHash, createHmac, randomBytes } from 'node:crypto';

/**
 * sha256(title + '|' + instructionsMd). Stored on each `hotspot_acknowledged`
 * event so if the host edits the hotspot later, the audit log still
 * represents the content the guest actually saw.
 */
export function hashHotspotContent(
  title: string,
  instructionsMd: string,
): string {
  return createHash('sha256').update(`${title}|${instructionsMd}`).digest('hex');
}

// In dev, fall back to a per-process random key with a loud warning. Restarts
// invalidate previously-stored audit hashes, which is acceptable for dev but
// not for production. CLAUDE.md flags this in the Stays section.
let cachedDevKey: string | null = null;
function getAuditKey(): string {
  const fromEnv = process.env.AUDIT_HMAC_KEY;
  if (fromEnv) return fromEnv;
  if (!cachedDevKey) {
    cachedDevKey = randomBytes(48).toString('base64');
    console.warn(
      '[stays] AUDIT_HMAC_KEY is unset — generating a per-process dev key. ' +
        'Stays completed before a restart will not verify after.',
    );
  }
  return cachedDevKey;
}

/**
 * HMAC over the concatenated event chain. Exists so we can prove the event
 * log hasn't been tampered with after the fact. Key rotation: store the
 * version alongside each stay; never delete old keys.
 */
export function computeAuditHash(
  events: Array<{
    type: string;
    occurredAt: Date;
    hotspotContentHash?: string | null;
  }>,
): string {
  const serialized = events
    .map(
      (e) =>
        `${e.type}:${e.occurredAt.toISOString()}:${e.hotspotContentHash ?? ''}`,
    )
    .join('\n');
  return createHmac('sha256', getAuditKey()).update(serialized).digest('hex');
}
