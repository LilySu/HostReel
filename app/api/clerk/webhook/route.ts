import { NextRequest, NextResponse } from 'next/server';
import { Webhook } from 'svix';
import { setBilling } from '@/lib/billing';

export const runtime = 'nodejs';

type ClerkWebhookEvent = {
  type: string;
  data: { id: string };
};

export async function POST(req: NextRequest) {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) return new NextResponse('Server misconfigured', { status: 500 });

  const svixId = req.headers.get('svix-id');
  const svixTimestamp = req.headers.get('svix-timestamp');
  const svixSignature = req.headers.get('svix-signature');
  if (!svixId || !svixTimestamp || !svixSignature) {
    return new NextResponse('Missing svix headers', { status: 400 });
  }

  const body = await req.text();
  let event: ClerkWebhookEvent;
  try {
    event = new Webhook(secret).verify(body, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as ClerkWebhookEvent;
  } catch (err) {
    console.error('Clerk webhook signature failed', err);
    return new NextResponse('Bad signature', { status: 400 });
  }

  if (event.type === 'user.created') {
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 14);
    await setBilling(event.data.id, {
      plan: 'trial',
      trialEndsAt: trialEndsAt.toISOString(),
    });
  }

  return NextResponse.json({ received: true });
}
