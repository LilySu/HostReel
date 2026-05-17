'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Share2 } from 'lucide-react';

export function ShareSheet({
  url,
  propertyName,
}: {
  url: string;
  propertyName: string;
}) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);

  // Render the QR code client-side to a data URL. Stay small (256px) since
  // the renderer scales for print perfectly fine and we don't want to ship a
  // big PNG over the wire.
  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(url, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 256,
      color: { dark: '#2A2723', light: '#FFFFFF' },
    })
      .then((dataUrl) => {
        if (!cancelled) setQrDataUrl(dataUrl);
      })
      .catch((err: unknown) => {
        console.error('qr render failed', err);
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  async function onCopy() {
    setShareError(null);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setShareError('Could not copy. Long-press the link to copy manually.');
    }
  }

  async function onNativeShare() {
    setShareError(null);
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: propertyName,
          text: `Walkthrough for ${propertyName}`,
          url,
        });
        return;
      } catch {
        // user dismissed — fall through to clipboard
      }
    }
    await onCopy();
  }

  return (
    <div className="surface-card grid gap-6 p-6 sm:grid-cols-[auto_minmax(0,1fr)]">
      <div className="flex items-center justify-center">
        <div className="rounded-md border border-sand-light bg-white p-2">
          {qrDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={qrDataUrl}
              alt={`QR code for ${propertyName} walkthrough`}
              className="h-32 w-32 sm:h-40 sm:w-40"
            />
          ) : (
            <div className="h-32 w-32 animate-pulse rounded bg-cream-dark sm:h-40 sm:w-40" />
          )}
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <div className="overline">Public link</div>
          <code className="mt-1 block break-all font-mono text-sm text-charcoal-light">
            {url}
          </code>
        </div>
        <p className="text-xs leading-relaxed text-charcoal-light">
          Print the QR code and stick it on the fridge, or share the link
          directly. Anyone with the link can view this walkthrough.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onNativeShare}
            className="btn-primary inline-flex items-center gap-2"
          >
            <Share2 size={14} />
            Share
          </button>
          <button type="button" onClick={onCopy} className="btn-secondary">
            {copied ? 'Copied!' : 'Copy link'}
          </button>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary"
          >
            Open guest view
          </a>
        </div>
        {shareError && <p className="text-xs text-red-700">{shareError}</p>}
      </div>
    </div>
  );
}
