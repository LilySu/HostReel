import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { requireUser, UnauthorizedError } from '@/lib/auth';
import { db } from '@/lib/db/client';
import { properties } from '@/lib/db/schema';
import { getPropertyForUser } from '@/lib/db/queries';
import { publishPropertySchema } from '@/lib/validators';
import { newShareSlug } from '@/lib/slug';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireUser();
    const { id } = await params;
    const existing = await getPropertyForUser(id, userId);
    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    const body = await req.json();
    const parsed = publishPropertySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', issues: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const updates: Record<string, unknown> = {
      published: parsed.data.published,
      updatedAt: new Date(),
    };
    // Per CLAUDE.md hard rule #9: regenerate the slug when republishing so old
    // shared links go dead. Unpublishing leaves the slug alone — flipping it
    // back invalidates the previous link automatically.
    if (parsed.data.published && !existing.published) {
      updates.shareSlug = newShareSlug();
    }

    const [row] = await db
      .update(properties)
      .set(updates)
      .where(eq(properties.id, id))
      .returning();
    return NextResponse.json({ property: row });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    throw err;
  }
}
