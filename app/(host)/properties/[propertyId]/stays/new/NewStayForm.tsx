'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const schema = z.object({
  guestName: z.string().trim().min(1).max(80),
  guestEmail: z.string().trim().email().max(254),
  checkInDate: z
    .string()
    .optional()
    .refine((v) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v), 'Use YYYY-MM-DD'),
  hostNote: z.string().trim().max(500).optional(),
});
type FormInput = z.infer<typeof schema>;

export function NewStayForm({
  propertyId,
  requiredCount,
}: {
  propertyId: string;
  requiredCount: number;
}) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [previewLink, setPreviewLink] = useState<string | null>(null);
  const [planGate, setPlanGate] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormInput>({
    resolver: zodResolver(schema),
    defaultValues: { guestName: '', guestEmail: '' },
  });

  async function onSubmit(values: FormInput) {
    setServerError(null);
    setPreviewLink(null);
    const res = await fetch('/api/stays', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        propertyId,
        guestName: values.guestName,
        guestEmail: values.guestEmail,
        checkInDate: values.checkInDate || null,
        hostNote: values.hostNote || undefined,
      }),
    });
    if (res.status === 402) {
      const body = (await res.json().catch(() => ({}))) as {
        plan?: string;
      };
      setPlanGate(body.plan ?? 'trial');
      return;
    }
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setServerError(body.error ?? 'Could not send the invitation.');
      return;
    }
    const body = (await res.json()) as {
      email: { delivered: boolean; previewLink: string | null };
    };
    if (!body.email.delivered && body.email.previewLink) {
      // Email isn't configured / failed — show the link so the host can copy it
      setPreviewLink(body.email.previewLink);
      return;
    }
    router.push(`/properties/${propertyId}/stays`);
    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="surface-card space-y-5 p-6"
    >
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-charcoal">Guest name</label>
        <input
          type="text"
          autoFocus
          maxLength={80}
          className="field-input"
          {...register('guestName')}
        />
        {errors.guestName?.message && (
          <p className="text-xs text-red-700">{errors.guestName.message}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium text-charcoal">Guest email</label>
        <input
          type="email"
          maxLength={254}
          className="field-input"
          {...register('guestEmail')}
        />
        {errors.guestEmail?.message && (
          <p className="text-xs text-red-700">{errors.guestEmail.message}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium text-charcoal">
          Check-in date{' '}
          <span className="text-charcoal-light">
            — optional, for your records only
          </span>
        </label>
        <input
          type="date"
          className="field-input"
          {...register('checkInDate')}
        />
        {errors.checkInDate?.message && (
          <p className="text-xs text-red-700">{errors.checkInDate.message}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium text-charcoal">
          Note in the email{' '}
          <span className="text-charcoal-light">(optional)</span>
        </label>
        <textarea
          rows={3}
          maxLength={500}
          placeholder="e.g. Looking forward to having you — door code arriving the day before."
          className="field-input resize-y"
          {...register('hostNote')}
        />
      </div>

      <p className="rounded-md border border-sand-light bg-cream/40 p-3 text-xs text-charcoal-light">
        Your guest will be asked to acknowledge{' '}
        <span className="font-medium text-charcoal">
          {requiredCount} {requiredCount === 1 ? 'item' : 'items'}
        </span>{' '}
        before they can complete check-in.
      </p>

      {planGate && (
        <div className="space-y-2 rounded-md border border-gold/40 bg-gold/10 p-4 text-sm">
          <p className="font-medium text-charcoal">
            Verified check-ins are a Pro feature.
          </p>
          <p className="text-charcoal-light">
            You&rsquo;re on the <span className="font-medium">{planGate}</span>{' '}
            plan. Upgrade to Pro to send invitations with magic links, audit
            trails, and PDF receipts.
          </p>
          <Link href="/billing" className="btn-primary inline-flex">
            Upgrade to Pro
          </Link>
        </div>
      )}

      {serverError && (
        <p className="text-sm text-red-700">{serverError}</p>
      )}

      {previewLink && (
        <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs">
          <p className="font-medium text-amber-900">
            Email isn&rsquo;t configured in this environment.
          </p>
          <p className="text-amber-800">
            The invitation was recorded, but you&rsquo;ll need to send this
            link to the guest yourself:
          </p>
          <code className="block break-all rounded bg-white p-2 font-mono text-[11px] text-amber-900">
            {previewLink}
          </code>
        </div>
      )}

      <div className="flex gap-2">
        <button type="submit" disabled={isSubmitting} className="btn-primary">
          {isSubmitting ? 'Sending…' : 'Send invitation'}
        </button>
      </div>
    </form>
  );
}
