import { NextRequest, NextResponse } from 'next/server';
import { and, asc, count, desc, eq } from 'drizzle-orm';
import { clerkClient } from '@clerk/nextjs/server';
import { requireUser, UnauthorizedError } from '@/lib/auth';
import { db } from '@/lib/db/client';
import { hotspots, stays, videos } from '@/lib/db/schema';
import { getPropertyForUser } from '@/lib/db/queries';
import { createStaySchema } from '@/lib/validators';
import { newId } from '@/lib/slug';
import { newMagicToken } from '@/lib/stays/token';
import { sendStayInvitation } from '@/lib/stays/email';
import {
  assertCanCreateStay,
  BillingLimitError,
  type BillingLimitResponse,
} from '@/lib/billing';

export const runtime = 'nodejs';

const DEFAULT_EXPIRES_DAYS = 30;

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUser();
    const body = await req.json();
    const parsed = createStaySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', issues: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const property = await getPropertyForUser(parsed.data.propertyId, userId);
    if (!property) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Stays is a Pro-tier feature. No-op when Stripe isn't configured.
    try {
      await assertCanCreateStay(userId);
    } catch (err) {
      if (err instanceof BillingLimitError) {
        const body: BillingLimitResponse = {
          error: 'Verified check-ins are a Pro plan feature.',
          code: 'BILLING_LIMIT',
          plan: err.plan,
          current: err.current,
          limit: err.limit,
        };
        return NextResponse.json(body, { status: 402 });
      }
      throw err;
    }

    // Required-acknowledgments gate: a Stay isn't meaningful without at least
    // one required hotspot. Surface a clear error pointing the host to the
    // editor rather than letting them send empty invitations.
    const [{ n }] = await db
      .select({ n: count() })
      .from(hotspots)
      .innerJoin(videos, eq(hotspots.videoId, videos.id))
      .where(
        and(
          eq(videos.propertyId, property.id),
          eq(hotspots.requiredAcknowledgment, true),
        ),
      );
    if (n === 0) {
      return NextResponse.json(
        {
          error:
            'Mark at least one hotspot as required before sending invitations.',
          code: 'NO_REQUIRED_HOTSPOTS',
        },
        { status: 400 },
      );
    }

    const days = parsed.data.expiresInDays ?? DEFAULT_EXPIRES_DAYS;
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    const stayId = newId();
    const token = newMagicToken();
    const [row] = await db
      .insert(stays)
      .values({
        id: stayId,
        propertyId: property.id,
        guestEmail: parsed.data.guestEmail.toLowerCase(),
        guestName: parsed.data.guestName,
        checkInDate: parsed.data.checkInDate ?? null,
        hostNote: parsed.data.hostNote ?? null,
        magicToken: token,
        expiresAt,
      })
      .returning();

    // Resolve host first name for the email — best effort.
    let hostFirstName: string | null = null;
    try {
      const c = await clerkClient();
      const user = await c.users.getUser(userId);
      hostFirstName = user.firstName ?? null;
    } catch {
      hostFirstName = null;
    }

    const baseUrl = process.env.PUBLIC_BASE_URL ?? 'http://localhost:3000';
    const link = `${baseUrl}/stay/${token}`;
    const result = await sendStayInvitation({
      toEmail: parsed.data.guestEmail,
      guestName: parsed.data.guestName,
      hostFirstName,
      propertyName: property.name,
      hostNote: parsed.data.hostNote,
      link,
    });

    return NextResponse.json(
      {
        stay: { ...row, magicToken: undefined },
        email: {
          delivered: result.delivered,
          // previewLink is only set when delivery failed / Resend unconfigured.
          // The token is the bearer credential, so we only return it to the
          // host who created the invitation (this auth'd request).
          previewLink: result.previewLink ?? null,
        },
      },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    throw err;
  }
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
    return NextResponse.json({
      stays: rows.map((r) => ({ ...r, magicToken: undefined })),
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    throw err;
  }
}
