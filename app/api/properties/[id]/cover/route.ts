import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { requireUser, UnauthorizedError } from '@/lib/auth';
import { db } from '@/lib/db/client';
import { properties } from '@/lib/db/schema';
import { getPropertyForUser } from '@/lib/db/queries';
import { MAX_PHOTO_FILE_BYTES, PHOTO_MIME_TYPES } from '@/lib/validators';
import { storage } from '@/lib/storage';

export const runtime = 'nodejs';

const requestSchema = z.object({
  contentType: z.enum([...PHOTO_MIME_TYPES] as [string, ...string[]]),
  sizeBytes: z.number().int().positive().max(MAX_PHOTO_FILE_BYTES),
});

function extForPhoto(t: string): '.jpg' | '.png' | '.webp' {
  if (t === 'image/png') return '.png';
  if (t === 'image/webp') return '.webp';
  return '.jpg';
}

// Issues a presigned PUT URL for a property's cover image. The DB row's
// coverImagePath is updated to the new key in this same request so the row
// becomes consistent with whatever was just promised — if the PUT then fails
// the cover will 404 until the host re-uploads. Cheaper than tracking
// "pending" state and the impact is purely cosmetic.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireUser();
    const { id } = await params;
    const property = await getPropertyForUser(id, userId);
    if (!property) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    const parsed = requestSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', issues: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const ext = extForPhoto(parsed.data.contentType);
    // Stamp the filename so the new upload doesn't get a stale CDN cache hit
    // at the same path as the previous cover.
    const stamp = Date.now();
    const key = `properties/${property.id}/cover-${stamp}${ext}`;

    // Best-effort: clean up the previous cover so we don't leak orphans.
    if (property.coverImagePath) {
      void storage.delete(property.coverImagePath);
    }

    await db
      .update(properties)
      .set({ coverImagePath: key, updatedAt: new Date() })
      .where(eq(properties.id, id));

    const { url, headers } = await storage.presignedUpload(
      key,
      parsed.data.contentType,
      900,
    );
    return NextResponse.json({ uploadUrl: url, uploadHeaders: headers });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    throw err;
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireUser();
    const { id } = await params;
    const property = await getPropertyForUser(id, userId);
    if (!property) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (property.coverImagePath) {
      void storage.delete(property.coverImagePath);
      await db
        .update(properties)
        .set({ coverImagePath: null, updatedAt: new Date() })
        .where(eq(properties.id, id));
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    throw err;
  }
}
