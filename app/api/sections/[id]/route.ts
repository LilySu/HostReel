import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { requireUser, UnauthorizedError } from '@/lib/auth';
import { db } from '@/lib/db/client';
import { sections, videos } from '@/lib/db/schema';
import { getSectionForUser } from '@/lib/db/queries';
import { updateSectionSchema } from '@/lib/validators';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireUser();
    const { id } = await params;
    const existing = await getSectionForUser(id, userId);
    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    const body = await req.json();
    const parsed = updateSectionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', issues: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const [row] = await db
      .update(sections)
      .set(parsed.data)
      .where(eq(sections.id, id))
      .returning();
    return NextResponse.json({ section: row });
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
    const existing = await getSectionForUser(id, userId);
    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Move any child videos to Unsorted (sectionId = null) BEFORE deleting the
    // section. The schema declares onDelete: 'set null', but SQLite's ALTER
    // TABLE syntax stripped that clause when section_id was added to the
    // existing videos table, so we enforce it here.
    await db
      .update(videos)
      .set({ sectionId: null })
      .where(eq(videos.sectionId, id));
    await db.delete(sections).where(eq(sections.id, id));

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    throw err;
  }
}
