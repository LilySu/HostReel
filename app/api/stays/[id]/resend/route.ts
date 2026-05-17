import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { clerkClient } from '@clerk/nextjs/server';
import { requireUser, UnauthorizedError } from '@/lib/auth';
import { db } from '@/lib/db/client';
import { properties, stays } from '@/lib/db/schema';
import { sendStayInvitation } from '@/lib/stays/email';

export const runtime = 'nodejs';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireUser();
    const { id } = await params;

    const rows = await db
      .select({ stay: stays, property: properties })
      .from(stays)
      .innerJoin(properties, eq(stays.propertyId, properties.id))
      .where(and(eq(stays.id, id), eq(properties.clerkUserId, userId)))
      .limit(1);
    if (rows.length === 0) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    const { stay, property } = rows[0];

    if (stay.status !== 'pending' && stay.status !== 'viewed') {
      return NextResponse.json(
        { error: 'Can only resend pending or viewed invitations' },
        { status: 400 },
      );
    }

    let hostFirstName: string | null = null;
    try {
      const c = await clerkClient();
      const user = await c.users.getUser(userId);
      hostFirstName = user.firstName ?? null;
    } catch {
      hostFirstName = null;
    }

    const baseUrl = process.env.PUBLIC_BASE_URL ?? 'http://localhost:3000';
    const link = `${baseUrl}/stay/${stay.magicToken}`;
    const result = await sendStayInvitation({
      toEmail: stay.guestEmail,
      guestName: stay.guestName,
      hostFirstName,
      propertyName: property.name,
      hostNote: stay.hostNote,
      link,
    });
    return NextResponse.json({
      ok: true,
      delivered: result.delivered,
      previewLink: result.previewLink ?? null,
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    throw err;
  }
}
