import { NextRequest, NextResponse } from 'next/server';
import { eq, max } from 'drizzle-orm';
import { requireUser, UnauthorizedError } from '@/lib/auth';
import { db } from '@/lib/db/client';
import { sections } from '@/lib/db/schema';
import { getPropertyForUser } from '@/lib/db/queries';
import { createSectionSchema } from '@/lib/validators';
import { newId } from '@/lib/slug';

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUser();
    const body = await req.json();
    const parsed = createSectionSchema.safeParse(body);
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

    // Place new section at the end of the current list
    const [{ maxOrder }] = await db
      .select({ maxOrder: max(sections.orderIndex) })
      .from(sections)
      .where(eq(sections.propertyId, property.id));
    const orderIndex = (maxOrder ?? -1) + 1;

    const [row] = await db
      .insert(sections)
      .values({
        id: newId(),
        propertyId: property.id,
        title: parsed.data.title,
        orderIndex,
      })
      .returning();
    return NextResponse.json({ section: row }, { status: 201 });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    throw err;
  }
}
