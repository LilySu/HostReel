'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Wifi,
  Trash,
  KeyRound,
  WashingMachine,
  TreePine,
  Car,
  CircleDot,
  MoreHorizontal,
  type LucideIcon,
} from 'lucide-react';
import type { HotspotIcon } from '@/lib/validators';

type StatusValue = 'pending' | 'viewed' | 'in_progress' | 'completed' | 'expired';

export type DashboardData = {
  propertyId: string;
  propertyName: string;
  totalRequired: number;
  columns: {
    id: string;
    title: string;
    icon: HotspotIcon;
    currentlyRequired: boolean;
  }[];
  rows: {
    id: string;
    guestName: string;
    guestEmail: string;
    checkInDate: string | null;
    status: StatusValue;
    createdAt: string;
    completedAt: string | null;
    expiresAt: string;
    ackByHotspot: Record<string, string>;
    ackCount: number;
  }[];
};

const ICON_BY_NAME: Record<HotspotIcon, LucideIcon> = {
  wifi: Wifi,
  appliance: WashingMachine,
  outdoor: TreePine,
  trash: Trash,
  key: KeyRound,
  parking: Car,
  other: CircleDot,
};

function relative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

function StatusPill({ row, total }: { row: DashboardData['rows'][number]; total: number }) {
  const map: Record<StatusValue, { label: string; cls: string }> = {
    pending: {
      label: 'Sent',
      cls: 'bg-amber-50 text-amber-800 border-amber-200',
    },
    viewed: {
      label: 'Viewed',
      cls: 'bg-blue-50 text-blue-800 border-blue-200',
    },
    in_progress: {
      label: `${row.ackCount}/${total}`,
      cls: 'bg-blue-50 text-blue-800 border-blue-200',
    },
    completed: {
      label: 'Done',
      cls: 'bg-green-50 text-green-800 border-green-200',
    },
    expired: {
      label: 'Expired',
      cls: 'bg-sand text-charcoal-light border-sand',
    },
  };
  const v = map[row.status];
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${v.cls}`}
    >
      {v.label}
    </span>
  );
}

function MenuItem({
  children,
  onClick,
  disabled = false,
  variant = 'default',
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: 'default' | 'danger';
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      className={
        variant === 'danger'
          ? 'block w-full px-3 py-2 text-left text-sm text-red-700 transition-colors duration-200 hover:bg-red-50 disabled:opacity-50'
          : 'block w-full px-3 py-2 text-left text-sm text-charcoal transition-colors duration-200 hover:bg-cream-dark disabled:opacity-50'
      }
    >
      {children}
    </button>
  );
}

export function StaysDashboard({ data }: { data: DashboardData }) {
  const router = useRouter();
  const [filter, setFilter] = useState<'all' | StatusValue>('all');
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [resending, setResending] = useState<string | null>(null);
  const [menuOpenFor, setMenuOpenFor] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  async function copyMagic(stayId: string) {
    if (acting) return;
    setActing(stayId);
    try {
      const res = await fetch(`/api/stays/${stayId}`);
      if (!res.ok) return;
      const body = (await res.json()) as { magicUrl?: string };
      if (!body.magicUrl) return;
      await navigator.clipboard.writeText(body.magicUrl);
      setCopyFeedback(stayId);
      setTimeout(() => setCopyFeedback(null), 2000);
    } catch {
      // swallow
    } finally {
      setActing(null);
      setMenuOpenFor(null);
    }
  }

  async function markExpired(stayId: string) {
    if (acting) return;
    setActing(stayId);
    const res = await fetch(`/api/stays/${stayId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'expire' }),
    });
    setActing(null);
    setMenuOpenFor(null);
    if (res.ok) router.refresh();
  }

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.rows.filter((r) => {
      if (filter !== 'all' && r.status !== filter) return false;
      if (!q) return true;
      return (
        r.guestName.toLowerCase().includes(q) ||
        r.guestEmail.toLowerCase().includes(q)
      );
    });
  }, [data.rows, filter, search]);

  async function onResend(stayId: string) {
    if (resending) return;
    setResending(stayId);
    try {
      const res = await fetch(`/api/stays/${stayId}/resend`, {
        method: 'POST',
      });
      if (!res.ok) return;
      router.refresh();
    } finally {
      setResending(null);
    }
  }

  if (data.rows.length === 0) {
    return (
      <div className="surface-card flex flex-col items-center px-6 py-14 text-center">
        <div className="overline">No stays yet</div>
        <h3 className="mt-3 font-serif text-2xl font-medium">
          Invite your first guest
        </h3>
        <p className="mt-2 max-w-md text-sm text-charcoal-light">
          A Stay is an invitation-only walkthrough. Your guest gets a magic
          link, acknowledges the things they need to know, and you get a
          signed PDF record for the file.
        </p>
        <Link
          href={`/properties/${data.propertyId}/stays/new`}
          className="btn-primary mt-6"
        >
          Invite guest
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-md border border-sand-light bg-white p-1 text-xs">
          {(
            [
              ['all', 'All'],
              ['pending', 'Pending'],
              ['in_progress', 'In progress'],
              ['completed', 'Completed'],
              ['expired', 'Expired'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={
                filter === key
                  ? 'rounded bg-cream-dark px-2.5 py-1 font-medium text-charcoal'
                  : 'rounded px-2.5 py-1 text-charcoal-light hover:text-charcoal'
              }
            >
              {label}
            </button>
          ))}
        </div>
        <input
          type="search"
          placeholder="Search by name or email"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="field-input max-w-sm flex-1"
        />
        <a
          href={`/api/stays/export?propertyId=${data.propertyId}`}
          download
          className="btn-secondary inline-flex"
        >
          Export CSV
        </a>
      </div>

      <div className="surface-card overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-cream-dark/30 text-left">
            <tr>
              <th className="sticky left-0 z-10 bg-cream-dark/40 px-4 py-3 text-xs font-medium uppercase tracking-wider text-charcoal-light">
                Guest
              </th>
              <th className="px-3 py-3 text-xs font-medium uppercase tracking-wider text-charcoal-light">
                Sent
              </th>
              {data.columns.map((c) => {
                const Icon = ICON_BY_NAME[c.icon];
                return (
                  <th
                    key={c.id}
                    title={c.currentlyRequired ? c.title : `${c.title} (no longer required)`}
                    className="px-3 py-3 text-center text-xs font-medium uppercase tracking-wider text-charcoal-light"
                  >
                    <span className="inline-flex flex-col items-center gap-1">
                      <Icon size={14} />
                      <span className="block max-w-[5.5rem] truncate text-[10px] font-normal normal-case tracking-normal">
                        {c.title}
                      </span>
                    </span>
                  </th>
                );
              })}
              <th className="px-3 py-3 text-xs font-medium uppercase tracking-wider text-charcoal-light">
                Status
              </th>
              <th className="px-3 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-sand-light">
            {visible.length === 0 ? (
              <tr>
                <td
                  colSpan={data.columns.length + 4}
                  className="px-4 py-10 text-center text-sm text-charcoal-light"
                >
                  No stays match these filters.
                </td>
              </tr>
            ) : (
              visible.map((r) => (
                <tr
                  key={r.id}
                  className="group cursor-pointer transition-colors duration-200 hover:bg-cream-dark/30"
                  onClick={() => setOpenId(r.id)}
                >
                  <td className="sticky left-0 z-[1] bg-white px-4 py-3 transition-colors duration-200 group-hover:bg-cream-dark/30">
                    <div className="font-medium text-charcoal">{r.guestName}</div>
                    <div className="text-xs text-charcoal-light">
                      {r.guestEmail}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-xs text-charcoal-light">
                    {relative(r.createdAt)}
                  </td>
                  {data.columns.map((c) => {
                    const ackedAt = r.ackByHotspot[c.id];
                    return (
                      <td key={c.id} className="px-3 py-3 text-center">
                        {ackedAt ? (
                          <div className="text-green-700">
                            <div title={new Date(ackedAt).toISOString()}>✓</div>
                            <div className="font-mono text-[10px] text-charcoal-light">
                              {shortDate(ackedAt)}
                            </div>
                          </div>
                        ) : c.currentlyRequired ? (
                          <span className="text-charcoal-light">—</span>
                        ) : (
                          <span
                            title="Not required anymore; never acknowledged"
                            className="text-charcoal-light/60 line-through"
                          >
                            —
                          </span>
                        )}
                      </td>
                    );
                  })}
                  <td className="whitespace-nowrap px-3 py-3">
                    <StatusPill row={r} total={data.totalRequired} />
                  </td>
                  <td
                    className="relative whitespace-nowrap px-3 py-3 text-right"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      aria-label="More actions"
                      onClick={() =>
                        setMenuOpenFor(menuOpenFor === r.id ? null : r.id)
                      }
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-charcoal-light transition-colors duration-200 hover:bg-cream-dark hover:text-charcoal"
                    >
                      <MoreHorizontal size={16} />
                    </button>
                    {menuOpenFor === r.id && (
                      <>
                        <button
                          type="button"
                          aria-label="Close menu"
                          onClick={() => setMenuOpenFor(null)}
                          className="fixed inset-0 z-20 cursor-default"
                          tabIndex={-1}
                        />
                        <div
                          role="menu"
                          className="absolute right-3 top-12 z-30 w-48 overflow-hidden rounded-md border border-sand-light bg-white text-left text-sm shadow-sm"
                        >
                          {r.status === 'completed' && (
                            <MenuItem
                              onClick={() => {
                                setOpenId(r.id);
                                setMenuOpenFor(null);
                              }}
                            >
                              View receipt + audit log
                            </MenuItem>
                          )}
                          {r.status !== 'expired' &&
                            r.status !== 'completed' && (
                              <MenuItem
                                disabled={acting === r.id}
                                onClick={() => copyMagic(r.id)}
                              >
                                {copyFeedback === r.id
                                  ? 'Copied!'
                                  : 'Copy magic link'}
                              </MenuItem>
                            )}
                          {(r.status === 'pending' ||
                            r.status === 'viewed') && (
                            <MenuItem
                              disabled={resending === r.id}
                              onClick={() => {
                                onResend(r.id);
                                setMenuOpenFor(null);
                              }}
                            >
                              {resending === r.id
                                ? 'Sending…'
                                : 'Resend invitation'}
                            </MenuItem>
                          )}
                          {r.status !== 'completed' &&
                            r.status !== 'expired' && (
                              <MenuItem
                                disabled={acting === r.id}
                                onClick={() => markExpired(r.id)}
                                variant="danger"
                              >
                                Mark as expired
                              </MenuItem>
                            )}
                        </div>
                      </>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {openId && (
        <StayDrawer
          stayId={openId}
          onClose={() => setOpenId(null)}
        />
      )}
    </div>
  );
}

function StayDrawer({
  stayId,
  onClose,
}: {
  stayId: string;
  onClose: () => void;
}) {
  // Lazy-load details only when opened. Keeps the dashboard payload small.
  // Trigger fetch on mount via effect inside the drawer body component.
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-stretch justify-end bg-charcoal/40"
      onClick={onClose}
    >
      <div
        className="flex h-full w-full max-w-md flex-col overflow-y-auto bg-white shadow-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <DrawerBody stayId={stayId} onClose={onClose} />
      </div>
    </div>
  );
}

type StayDetails = {
  stay: {
    id: string;
    guestName: string;
    guestEmail: string;
    status: StatusValue;
    createdAt: string;
    completedAt: string | null;
    consentedAt: string | null;
    consentedIp: string | null;
    typedSignature: string | null;
    signatureIp: string | null;
    auditHash: string | null;
    receiptPdfPath: string | null;
  };
  events: Array<{
    id: string;
    type: string;
    hotspotId: string | null;
    hotspotContentHash: string | null;
    videoTimeSeconds: number | null;
    ip: string | null;
    userAgent: string | null;
    occurredAt: string;
  }>;
};

function DrawerBody({
  stayId,
  onClose,
}: {
  stayId: string;
  onClose: () => void;
}) {
  const [details, setDetails] = useState<StayDetails | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/stays/${stayId}`);
        if (!res.ok) throw new Error(`Failed (${res.status})`);
        const body = (await res.json()) as StayDetails;
        if (!cancelled) setDetails(body);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [stayId]);

  return (
    <>
      <div className="flex items-start justify-between gap-4 border-b border-sand-light px-6 py-4">
        <div>
          <div className="overline">Stay detail</div>
          <h3 className="mt-1 font-serif text-xl font-medium tracking-tight">
            {details ? details.stay.guestName : 'Loading…'}
          </h3>
          {details && (
            <p className="text-xs text-charcoal-light">
              {details.stay.guestEmail}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md px-2 py-1 text-sm text-charcoal-light hover:bg-cream-dark hover:text-charcoal"
        >
          Close
        </button>
      </div>

      {error && (
        <div className="px-6 py-4 text-sm text-red-700">{error}</div>
      )}

      {details && (
        <div className="space-y-6 px-6 py-5">
          {details.stay.receiptPdfPath && (
            <a
              href={`/api/media/${details.stay.receiptPdfPath}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary inline-flex"
            >
              View receipt PDF
            </a>
          )}

          {details.stay.auditHash && (
            <div className="space-y-1">
              <div className="overline">Audit hash</div>
              <code className="block break-all rounded-md border border-sand-light bg-cream-dark/30 p-2 font-mono text-[10px]">
                {details.stay.auditHash}
              </code>
            </div>
          )}

          <div className="space-y-2">
            <div className="overline">Event log</div>
            <ul className="space-y-2">
              {details.events.map((e) => (
                <li
                  key={e.id}
                  className="rounded-md border border-sand-light bg-cream/40 p-2 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-charcoal">{e.type}</span>
                    <span className="font-mono text-[10px] text-charcoal-light">
                      {new Date(e.occurredAt).toLocaleString()}
                    </span>
                  </div>
                  {e.ip && (
                    <div className="mt-1 font-mono text-[10px] text-charcoal-light">
                      ip {e.ip}
                    </div>
                  )}
                  {e.hotspotContentHash && (
                    <div className="mt-0.5 break-all font-mono text-[9px] text-charcoal-light">
                      {e.hotspotContentHash.slice(0, 32)}…
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
