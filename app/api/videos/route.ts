import { NextRequest, NextResponse } from 'next/server';
import { and, eq, isNull, max } from 'drizzle-orm';
import { requireUser, UnauthorizedError } from '@/lib/auth';
import { db } from '@/lib/db/client';
import { videos } from '@/lib/db/schema';
import { getPropertyForUser, getSectionForUser } from '@/lib/db/queries';
import { createVideoSchema, extForContentType } from '@/lib/validators';
import { newId } from '@/lib/slug';
import { storage } from '@/lib/storage';
import {
  assertCanCreateVideo,
  BillingLimitError,
  type BillingLimitResponse,
} from '@/lib/billing';

// Issues a presigned PUT URL the browser uploads to directly. The video row
// is created here with status='uploading' and storagePath pre-filled; the
// caller finalizes (probe + poster + status=ready) via /api/videos/[id]/finalize
// after the PUT completes.
//
// Node runtime is required since storage.presignedUpload may import the AWS
// SDK transitively (R2 provider).
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUser();
    const body = await req.json();
    const parsed = createVideoSchema.safeParse(body);
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

    const sectionId = parsed.data.sectionId ?? null;
    if (sectionId) {
      const section = await getSectionForUser(sectionId, userId);
      if (!section || section.property.id !== property.id) {
        return NextResponse.json({ error: 'Invalid section' }, { status: 400 });
      }
    }

    // Billing gate. No-op when STRIPE_SECRET_KEY isn't set (dev / pre-billing).
    try {
      await assertCanCreateVideo(userId);
    } catch (err) {
      if (err instanceof BillingLimitError) {
        const body: BillingLimitResponse = {
          error: err.message,
          code: 'BILLING_LIMIT',
          plan: err.plan,
          current: err.current,
          limit: err.limit,
        };
        return NextResponse.json(body, { status: 402 });
      }
      throw err;
    }

    const [{ maxOrder }] = await db
      .select({ maxOrder: max(videos.orderIndex) })
      .from(videos)
      .where(
        and(
          eq(videos.propertyId, property.id),
          sectionId ? eq(videos.sectionId, sectionId) : isNull(videos.sectionId),
        ),
      );
    const orderIndex = (maxOrder ?? -1) + 1;

    const videoId = newId();
    const ext = extForContentType(parsed.data.contentType);
    const key = `properties/${property.id}/videos/${videoId}/source${ext}`;

    const [row] = await db
      .insert(videos)
      .values({
        id: videoId,
        propertyId: property.id,
        sectionId,
        title: parsed.data.title,
        description: parsed.data.description ?? null,
        orderIndex,
        storagePath: key,
        durationSeconds: 0,
        status: 'uploading',
      })
      .returning();

    const { url, headers } = await storage.presignedUpload(
      key,
      parsed.data.contentType,
      900,
    );

    return NextResponse.json(
      { video: row, uploadUrl: url, uploadHeaders: headers },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    throw err;
  }
}
