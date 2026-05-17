import 'server-only';
import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from 'pdf-lib';

export type PdfAcknowledgment = {
  title: string;
  instructionsAtAckTime: string; // What the guest actually saw at ack time
  contentHash: string;
  acknowledgedAt: Date;
  ip: string | null;
  contentDriftedSinceAck: boolean; // True if current hotspot text differs from the hash
};

export type PdfReceiptInput = {
  propertyName: string;
  hostName: string | null;
  guestName: string;
  guestEmail: string;
  consentText: string;
  consentedAt: Date;
  consentedIp: string | null;
  acknowledgments: PdfAcknowledgment[];
  typedSignature: string;
  signedAt: Date;
  signatureIp: string | null;
  stayId: string;
  auditHash: string;
  verificationUrl: string;
};

const PAGE_WIDTH = 595.28; // A4
const PAGE_HEIGHT = 841.89;
const MARGIN = 56;
const TEXT_WIDTH = PAGE_WIDTH - MARGIN * 2;

function formatTs(d: Date): string {
  return d.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC');
}

function escapeForPdf(s: string): string {
  // pdf-lib's StandardFonts handle WinAnsi only — strip anything outside it.
  return s.replace(/[^\x20-\x7E\n]/g, '?');
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const safe = escapeForPdf(text);
  const out: string[] = [];
  for (const paragraph of safe.split(/\n+/)) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    let line = '';
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(test, size) > maxWidth && line) {
        out.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) out.push(line);
    out.push('');
  }
  while (out.length > 0 && out[out.length - 1] === '') out.pop();
  return out;
}

class Layout {
  private page: PDFPage;
  private y: number;

  constructor(
    private doc: PDFDocument,
    private serif: PDFFont,
    private sans: PDFFont,
    private serifBold: PDFFont,
  ) {
    this.page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.y = PAGE_HEIGHT - MARGIN;
  }

  private ensure(neededHeight: number): void {
    if (this.y - neededHeight < MARGIN) {
      this.page = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      this.y = PAGE_HEIGHT - MARGIN;
    }
  }

  heading(text: string): void {
    this.ensure(28);
    this.page.drawText(escapeForPdf(text), {
      x: MARGIN,
      y: this.y - 20,
      size: 22,
      font: this.serifBold,
      color: rgb(0.16, 0.15, 0.14),
    });
    this.y -= 32;
  }

  subheading(text: string): void {
    this.ensure(20);
    this.page.drawText(escapeForPdf(text), {
      x: MARGIN,
      y: this.y - 12,
      size: 11,
      font: this.sans,
      color: rgb(0.35, 0.33, 0.3),
    });
    this.y -= 18;
  }

  rule(): void {
    this.ensure(12);
    this.page.drawRectangle({
      x: MARGIN,
      y: this.y - 1,
      width: TEXT_WIDTH,
      height: 0.5,
      color: rgb(0.91, 0.87, 0.79),
    });
    this.y -= 12;
  }

  body(
    text: string,
    opts: { size?: number; bold?: boolean; muted?: boolean } = {},
  ): void {
    const size = opts.size ?? 10;
    const font = opts.bold ? this.serifBold : this.sans;
    const color = opts.muted
      ? rgb(0.35, 0.33, 0.3)
      : rgb(0.16, 0.15, 0.14);
    const lines = wrap(text, font, size, TEXT_WIDTH);
    for (const line of lines) {
      this.ensure(size + 4);
      this.page.drawText(line, {
        x: MARGIN,
        y: this.y - size,
        size,
        font,
        color,
      });
      this.y -= size + 4;
    }
  }

  keyValue(key: string, value: string): void {
    const size = 10;
    this.ensure(size + 4);
    const keyText = `${key}: `;
    const keyWidth = this.sans.widthOfTextAtSize(escapeForPdf(keyText), size);
    this.page.drawText(escapeForPdf(keyText), {
      x: MARGIN,
      y: this.y - size,
      size,
      font: this.serifBold,
      color: rgb(0.35, 0.33, 0.3),
    });
    const valLines = wrap(value, this.sans, size, TEXT_WIDTH - keyWidth);
    for (let i = 0; i < valLines.length; i++) {
      if (i > 0) {
        this.y -= size + 4;
        this.ensure(size + 4);
      }
      this.page.drawText(valLines[i], {
        x: MARGIN + keyWidth,
        y: this.y - size,
        size,
        font: this.sans,
        color: rgb(0.16, 0.15, 0.14),
      });
    }
    this.y -= size + 6;
  }

  spacer(amount = 12): void {
    this.y -= amount;
  }

  footnote(text: string): void {
    this.ensure(11);
    this.page.drawText(escapeForPdf(text), {
      x: MARGIN,
      y: this.y - 9,
      size: 8,
      font: this.sans,
      color: rgb(0.5, 0.48, 0.45),
    });
    this.y -= 13;
  }
}

export async function generateReceiptPdf(input: PdfReceiptInput): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Acknowledgment Record — ${input.propertyName}`);
  doc.setAuthor('HostReel');
  doc.setSubject(`Stay ${input.stayId}`);
  doc.setCreator('HostReel');

  const serif = await doc.embedFont(StandardFonts.TimesRoman);
  const serifBold = await doc.embedFont(StandardFonts.TimesRomanBold);
  const sans = await doc.embedFont(StandardFonts.Helvetica);

  const L = new Layout(doc, serif, sans, serifBold);

  L.heading('Check-in Acknowledgment Record');
  L.subheading(input.propertyName);
  L.rule();

  L.keyValue('Guest', `${input.guestName} <${input.guestEmail}>`);
  if (input.hostName) L.keyValue('Host', input.hostName);
  L.keyValue('Stay ID', input.stayId);
  L.spacer(8);

  L.body('Consent given', { bold: true, size: 11 });
  L.body(input.consentText, { muted: true, size: 9 });
  L.body(
    `Recorded at ${formatTs(input.consentedAt)}${
      input.consentedIp ? ` from ${input.consentedIp}` : ''
    }.`,
    { muted: true, size: 9 },
  );
  L.spacer(8);

  L.body('Acknowledged items', { bold: true, size: 11 });
  L.spacer(4);
  for (let i = 0; i < input.acknowledgments.length; i++) {
    const a = input.acknowledgments[i];
    L.body(`${i + 1}. ${a.title}`, { bold: true });
    if (a.instructionsAtAckTime.trim()) {
      L.body(a.instructionsAtAckTime, { muted: true });
    } else {
      L.body('(no instructions on this item)', { muted: true });
    }
    L.body(
      `Acknowledged ${formatTs(a.acknowledgedAt)}${a.ip ? ` from ${a.ip}` : ''}.`,
      { muted: true, size: 9 },
    );
    L.body(`Content hash: ${a.contentHash}`, { muted: true, size: 8 });
    if (a.contentDriftedSinceAck) {
      L.body(
        'Note: the host has edited this item since acknowledgment. This record reflects the version the guest saw.',
        { muted: true, size: 8 },
      );
    }
    L.spacer(6);
  }

  L.rule();
  L.body('Electronic signature', { bold: true, size: 11 });
  L.body(`Typed name: ${input.typedSignature}`);
  L.body(
    `Signed at ${formatTs(input.signedAt)}${input.signatureIp ? ` from ${input.signatureIp}` : ''}.`,
    { muted: true },
  );
  L.body(
    'Your typed name above serves as your electronic signature confirming the acknowledgments above.',
    { muted: true, size: 9 },
  );
  L.spacer(8);

  L.rule();
  L.footnote(`Audit hash: ${input.auditHash}`);
  L.footnote(`Verify: ${input.verificationUrl}`);
  L.footnote(
    'This record documents the acknowledgments listed above. It is not a legal contract; consult an attorney for legal advice.',
  );

  const bytes = await doc.save();
  return Buffer.from(bytes);
}
