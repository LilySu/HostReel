import { NextRequest, NextResponse } from 'next/server';
import { asc, desc, eq } from 'drizzle-orm';
import { requireUser, UnauthorizedError } from '@/lib/auth';
import { db } from '@/lib/db/client';
import { stays } from '@/lib/db/schema';
import { getPropertyForUser } from '@/lib/db/queries';

export const runtime = 'nodejs';

// Quote a field per RFC 4180. Newlines, commas, and quotes are common in
// guest names + emails; safer to always quote and escape internal quotes.
function csvField(value: unknown): string {
  if (value === null || value === undefined) return '""';
  const s = String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

function isoOrEmpty(d: Date | null): string {
  return d ? d.toISOString() : '';
}

export async function GET(req: NextRequest) {
  try {
    const userId = await requireUser();
    const propertyId = req.nextUrl.searchParams.get('propertyId');
    if (!propertyId) {
      return NextResponse.json(
        { error: 'propertyId is required' },
        { status: 400 },
      );
    }
    const property = await getPropertyForUser(propertyId, userId);
    if (!property) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const rows = await db
      .select()
      .from(stays)
      .where(eq(stays.propertyId, propertyId))
      .orderBy(desc(stays.createdAt), asc(stays.guestName));

    const header = [
      'Guest name',
      'Guest email',
      'Check-in date',
      'Invited at',
      'Status',
      'Completed at',
      'Signed name',
      'Audit hash',
      'Stay id',
    ];
    const lines = [header.map(csvField).join(',')];
    for (const s of rows) {
      lines.push(
        [
          s.guestName,
          s.guestEmail,
          s.checkInDate ?? '',
          isoOrEmpty(s.createdAt),
          s.status,
          isoOrEmpty(s.completedAt),
          s.typedSignature ?? '',
          s.auditHash ?? '',
          s.id,
        ]
          .map(csvField)
          .join(','),
      );
    }
    // RFC 4180 line ending. Some spreadsheet tools tolerate \n but Excel is
    // fussier on Windows.
    const csv = lines.join('\r\n') + '\r\n';

    // Filename has the property name (filesystem-safe) + date stamp so
    // downloading multiple exports doesn't overwrite.
    const safeName = property.name
      .replace(/[^a-zA-Z0-9-_]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60)
      .toLowerCase();
    const stamp = new Date().toISOString().slice(0, 10);
    const filename = `${safeName || 'stays'}-${stamp}.csv`;

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        // Don't cache — the host's CSV reflects live data and should never
        // get served stale from a CDN.
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    throw err;
  }
}
