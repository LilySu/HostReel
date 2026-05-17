import 'server-only';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import type { StorageProvider } from './provider';

// HMAC secret for local presigned upload tokens. Falls back to a
// per-process random value, so dev tokens issued before a server restart are
// invalidated by the restart. Acceptable since these URLs live ~15 minutes.
const SIGNING_SECRET =
  process.env.LOCAL_UPLOAD_SECRET || crypto.randomBytes(32).toString('hex');

type LocalUploadPayload = { key: string; contentType: string; exp: number };

function signToken(payload: LocalUploadPayload): string {
  const json = JSON.stringify(payload);
  const b64 = Buffer.from(json).toString('base64url');
  const mac = crypto
    .createHmac('sha256', SIGNING_SECRET)
    .update(b64)
    .digest('base64url');
  return `${b64}.${mac}`;
}

/**
 * Verifies a token issued by LocalStorageProvider.presignedUpload().
 * Returns `null` on bad signature, malformed payload, or expiry.
 *
 * Imported by the same-origin upload route (`/api/upload-local/[token]`).
 */
export function verifyLocalUploadToken(
  token: string,
): { key: string; contentType: string } | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [b64, mac] = parts;
  const expected = crypto
    .createHmac('sha256', SIGNING_SECRET)
    .update(b64)
    .digest('base64url');
  const macBuf = Buffer.from(mac);
  const expectedBuf = Buffer.from(expected);
  if (
    macBuf.length !== expectedBuf.length ||
    !crypto.timingSafeEqual(macBuf, expectedBuf)
  ) {
    return null;
  }
  let payload: LocalUploadPayload;
  try {
    payload = JSON.parse(
      Buffer.from(b64, 'base64url').toString('utf8'),
    ) as LocalUploadPayload;
  } catch {
    return null;
  }
  if (typeof payload.exp !== 'number') return null;
  if (payload.exp < Math.floor(Date.now() / 1000)) return null;
  return { key: payload.key, contentType: payload.contentType };
}

const STORAGE_DIR = path.resolve(process.env.STORAGE_DIR ?? './storage');

// Map of file extensions we care about → MIME types
const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

/**
 * Resolves a storage-relative key to an absolute path and guards against
 * directory traversal. Throws if the resolved path escapes STORAGE_DIR.
 */
function resolveSafe(key: string): string {
  // Strip leading slashes/backslashes; normalize separators
  const cleaned = key.replace(/^[/\\]+/, '');
  const abs = path.resolve(STORAGE_DIR, cleaned);
  const rel = path.relative(STORAGE_DIR, abs);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`Refusing to access path outside storage dir: ${key}`);
  }
  return abs;
}

export class LocalStorageProvider implements StorageProvider {
  async save(
    data: Buffer | NodeJS.ReadableStream,
    key: string,
    _contentType: string,
  ): Promise<{ path: string }> {
    const abs = resolveSafe(key);
    await fsp.mkdir(path.dirname(abs), { recursive: true });

    if (Buffer.isBuffer(data)) {
      await fsp.writeFile(abs, data);
    } else {
      const out = fs.createWriteStream(abs);
      await pipeline(data, out);
    }

    return { path: key.replace(/^[/\\]+/, '') };
  }

  async delete(key: string): Promise<void> {
    try {
      const abs = resolveSafe(key);
      await fsp.unlink(abs);
    } catch (err: unknown) {
      if (
        typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        (err as { code: string }).code === 'ENOENT'
      ) {
        return; // already gone
      }
      throw err;
    }
  }

  publicUrl(key: string): string {
    return `/api/media/${key.replace(/^[/\\]+/, '')}`;
  }

  async read(
    key: string,
  ): Promise<
    | { stream: NodeJS.ReadableStream; size: number; contentType: string }
    | null
  > {
    const abs = resolveSafe(key);
    try {
      const stat = await fsp.stat(abs);
      const ext = path.extname(abs).toLowerCase();
      const contentType =
        CONTENT_TYPE_BY_EXT[ext] ?? 'application/octet-stream';
      return {
        stream: Readable.toWeb(fs.createReadStream(abs)) as unknown as NodeJS.ReadableStream,
        size: stat.size,
        contentType,
      };
    } catch {
      return null;
    }
  }

  async readRange(
    key: string,
    start: number,
    end: number,
  ): Promise<
    | { stream: NodeJS.ReadableStream; size: number; contentType: string }
    | null
  > {
    const abs = resolveSafe(key);
    try {
      const stat = await fsp.stat(abs);
      const ext = path.extname(abs).toLowerCase();
      const contentType =
        CONTENT_TYPE_BY_EXT[ext] ?? 'application/octet-stream';
      const clampedEnd = Math.min(end, stat.size - 1);
      return {
        stream: Readable.toWeb(
          fs.createReadStream(abs, { start, end: clampedEnd }),
        ) as unknown as NodeJS.ReadableStream,
        size: stat.size,
        contentType,
      };
    } catch {
      return null;
    }
  }

  async absolutePath(key: string): Promise<string> {
    return resolveSafe(key);
  }

  async presignedUpload(
    key: string,
    contentType: string,
    expiresInSeconds = 900,
  ): Promise<{ url: string; headers: Record<string, string> }> {
    const cleaned = key.replace(/^[/\\]+/, '');
    const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
    const token = signToken({ key: cleaned, contentType, exp });
    return {
      // Same-origin URL — the browser sends a PUT here and our route handler
      // validates the token, then writes via this provider's `save()`.
      url: `/api/upload-local/${token}`,
      headers: { 'Content-Type': contentType },
    };
  }
}
