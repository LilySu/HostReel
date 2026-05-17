import { NextRequest, NextResponse } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import { requireUser, UnauthorizedError } from '@/lib/auth';
import { db } from '@/lib/db/client';
import { properties } from '@/lib/db/schema';
import { createPropertySchema } from '@/lib/validators';
import { newId, newShareSlug } from '@/lib/slug';

export async function GET() {
  try {
    const userId = await requireUser();
    const rows = await db
      .select()
      .from(properties)
      .where(eq(properties.clerkUserId, userId))
      .orderBy(desc(properties.createdAt));
    return NextResponse.json({ properties: rows });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    throw err;
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUser();
    const body = await req.json();
    const parsed = createPropertySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', issues: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const id = newId();
    const shareSlug = newShareSlug();
    const [row] = await db
      .insert(properties)
      .values({
        id,
        clerkUserId: userId,
        name: parsed.data.name,
        shareSlug,
      })
      .returning();
    return NextResponse.json({ property: row }, { status: 201 });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    throw err;
  }
}
