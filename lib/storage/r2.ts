import 'server-only';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { StorageProvider } from './provider';

// Lazy-init: env reads happen on first method call, not at module load.
// This means importing this file from lib/storage/index.ts is safe even when
// STORAGE_PROVIDER=local and no R2_* vars are present.
function readEnv(): {
  accountId: string;
  bucket: string;
  publicUrlBase: string;
  accessKeyId: string;
  secretAccessKey: string;
} {
  function req(name: string): string {
    const v = process.env[name];
    if (!v) throw new Error(`Missing env var: ${name}`);
    return v;
  }
  return {
    accountId: req('R2_ACCOUNT_ID'),
    bucket: req('R2_BUCKET'),
    publicUrlBase: req('R2_PUBLIC_URL').replace(/\/+$/, ''),
    accessKeyId: req('R2_ACCESS_KEY_ID'),
    secretAccessKey: req('R2_SECRET_ACCESS_KEY'),
  };
}

function cleanKey(key: string): string {
  return key.replace(/^[/\\]+/, '');
}

// "bytes 0-499/1234567" → 1234567
function parseTotalFromContentRange(cr: string | undefined): number {
  if (!cr) return 0;
  const m = /\/(\d+)$/.exec(cr);
  return m ? Number(m[1]) : 0;
}

export class R2StorageProvider implements StorageProvider {
  private cachedClient: S3Client | null = null;
  private cachedConfig: ReturnType<typeof readEnv> | null = null;

  private cfg() {
    if (!this.cachedConfig) this.cachedConfig = readEnv();
    return this.cachedConfig;
  }

  private client() {
    if (this.cachedClient) return this.cachedClient;
    const c = this.cfg();
    this.cachedClient = new S3Client({
      region: 'auto',
      endpoint: `https://${c.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: c.accessKeyId,
        secretAccessKey: c.secretAccessKey,
      },
      // AWS SDK v3.730+ adds an automatic CRC32 checksum to PutObject by
      // default. For presigned uploads this bakes a placeholder
      // x-amz-checksum-crc32=AAAAAA== into the signed URL — the browser then
      // PUTs real bytes, R2 verifies the (mismatched) CRC, and the request
      // fails with SignatureDoesNotMatch. The browser can't compute or send
      // the matching checksum back, so the only working setup for browser
      // uploads is "checksum WHEN_REQUIRED" — off by default for PutObject.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
    return this.cachedClient;
  }

  /**
   * Server-side save. Only for small server-generated artifacts (poster
   * frames). Reject anything that isn't a Buffer — large uploads must use
   * presignedUpload() so video bytes never touch the app server.
   */
  async save(
    data: Buffer | NodeJS.ReadableStream,
    key: string,
    contentType: string,
  ): Promise<{ path: string }> {
    if (!Buffer.isBuffer(data)) {
      throw new Error(
        'R2StorageProvider.save() accepts only Buffer. For large uploads use presignedUpload().',
      );
    }
    const cleaned = cleanKey(key);
    await this.client().send(
      new PutObjectCommand({
        Bucket: this.cfg().bucket,
        Key: cleaned,
        Body: data,
        ContentType: contentType,
      }),
    );
    return { path: cleaned };
  }

  async delete(key: string): Promise<void> {
    try {
      await this.client().send(
        new DeleteObjectCommand({
          Bucket: this.cfg().bucket,
          Key: cleanKey(key),
        }),
      );
    } catch {
      // idempotent — missing object is fine
    }
  }

  publicUrl(key: string): string {
    return `${this.cfg().publicUrlBase}/${cleanKey(key)}`;
  }

  async presignedUpload(
    key: string,
    contentType: string,
    expiresInSeconds = 900,
  ): Promise<{ url: string; headers: Record<string, string> }> {
    const cmd = new PutObjectCommand({
      Bucket: this.cfg().bucket,
      Key: cleanKey(key),
      ContentType: contentType,
    });
    const url = await getSignedUrl(this.client(), cmd, {
      expiresIn: expiresInSeconds,
    });
    return { url, headers: { 'Content-Type': contentType } };
  }

  async read(key: string) {
    try {
      const result = await this.client().send(
        new GetObjectCommand({
          Bucket: this.cfg().bucket,
          Key: cleanKey(key),
        }),
      );
      if (!result.Body) return null;
      return {
        stream: result.Body as unknown as NodeJS.ReadableStream,
        size: result.ContentLength ?? 0,
        contentType: result.ContentType ?? 'application/octet-stream',
      };
    } catch {
      return null;
    }
  }

  async readRange(key: string, start: number, end: number) {
    try {
      const result = await this.client().send(
        new GetObjectCommand({
          Bucket: this.cfg().bucket,
          Key: cleanKey(key),
          Range: `bytes=${start}-${end}`,
        }),
      );
      if (!result.Body) return null;
      // R2 returns the *range* size in ContentLength. We want the FULL file
      // size for Content-Range headers — parse it out of ContentRange.
      const fullSize =
        parseTotalFromContentRange(result.ContentRange) ||
        (result.ContentLength ?? 0);
      return {
        stream: result.Body as unknown as NodeJS.ReadableStream,
        size: fullSize,
        contentType: result.ContentType ?? 'application/octet-stream',
      };
    } catch {
      return null;
    }
  }

  /**
   * R2 doesn't expose objects as local files. The finalize route handles this
   * by streaming the object into a temp file before invoking ffprobe/ffmpeg.
   * Calling absolutePath() against an R2-backed key is a misuse.
   */
  async absolutePath(_key: string): Promise<string> {
    throw new Error(
      'R2StorageProvider.absolutePath() not supported — stream to a temp file in the finalize route instead.',
    );
  }
}
