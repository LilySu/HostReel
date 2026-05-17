'use client';

import { useEffect, useRef } from 'react';

export function ConfirmModal({
  title,
  description,
  confirmLabel = 'Confirm',
  destructive = false,
  pending,
  onCancel,
  onConfirm,
}: {
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !pending) onCancel();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pending, onCancel]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div
        className="absolute inset-0 bg-charcoal/50"
        onClick={() => !pending && onCancel()}
      />
      <div className="relative w-full max-w-md rounded-lg border border-sand-light bg-cream p-7 shadow-sm">
        <div className="overline">Confirm</div>
        <h2
          id="confirm-modal-title"
          className="mt-2 font-serif text-2xl font-medium"
        >
          {title}
        </h2>
        <div className="mt-3 text-sm leading-relaxed text-charcoal-light">
          {description}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="btn-secondary"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className={
              destructive
                ? 'inline-flex items-center justify-center rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors duration-200 hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/40 focus-visible:ring-offset-2 focus-visible:ring-offset-cream disabled:opacity-50'
                : 'btn-primary'
            }
          >
            {pending ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
