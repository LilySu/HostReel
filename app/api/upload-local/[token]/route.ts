import { NextRequest, NextResponse } from 'next/server';
import { Readable } from 'node:stream';
import {
  LocalStorageProvider,
  verifyLocalUploadToken,
} from '@/lib/storage/local';

// Browser PUTs directly to this route in local dev. Token in the path
// authorizes the write — its HMAC binds the key + contentType + expiry.
//
// This route is public on purpose: presigned uploads imply no Clerk session.
// The token is the authorization. Listed under middleware.ts's public matcher.
export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const local = new LocalStorageProvider();

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const decoded = verifyLocalUploadToken(token);
  if (!decoded) {
    return NextResponse.json(
      { error: 'Invalid or expired upload token' },
      { status: 401 },
    );
  }

  const reqContentType = (req.headers.get('content-type') ?? '')
    .split(';')[0]
    .trim();
  if (reqContentType !== decoded.contentType) {
    return NextResponse.json(
      {
        error: `Content-Type mismatch: signed ${decoded.contentType}, got ${reqContentType}`,
      },
      { status: 400 },
    );
  }

  if (!req.body) {
    return NextResponse.json({ error: 'Empty body' }, { status: 400 });
  }

  // Stream the request body straight to disk — never buffer the full file.
  const nodeStream = Readable.fromWeb(
    req.body as unknown as Parameters<typeof Readable.fromWeb>[0],
  );
  try {
    await local.save(nodeStream, decoded.key, decoded.contentType);
  } catch (err) {
    console.error('local upload failed', err);
    return NextResponse.json({ error: 'Write failed' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
