import 'server-only';

/**
 * Storage abstraction. All file I/O in this app goes through an implementation
 * of this interface — never `fs` directly in route handlers or components.
 *
 * Swap the export in `lib/storage/index.ts` to migrate from local disk to S3/R2
 * without touching call sites.
 */
export interface StorageProvider {
  /**
   * Save a file. Returns the canonical storage path (relative, no leading slash).
   * The path is what gets persisted in the DB.
   */
  save(
    data: Buffer | NodeJS.ReadableStream,
    key: string,
    contentType: string,
  ): Promise<{ path: string }>;

  /**
   * Delete a file by storage path. Idempotent — no error if missing.
   */
  delete(path: string): Promise<void>;

  /**
   * Returns a URL the browser can use to fetch this file. For LocalStorageProvider
   * this routes through /api/media/[...path]; for cloud providers this may be a
   * signed URL or a CDN URL.
   */
  publicUrl(path: string): string;

  /**
   * Get a readable stream for a file. Used by the media route handler.
   * Returns null if the file does not exist.
   */
  read(
    path: string,
  ): Promise<{
    stream: NodeJS.ReadableStream;
    size: number;
    contentType: string;
  } | null>;

  /**
   * Get a partial readable stream for range requests (video seeking).
   * `start` and `end` are inclusive byte offsets.
   */
  readRange(
    path: string,
    start: number,
    end: number,
  ): Promise<{
    stream: NodeJS.ReadableStream;
    size: number;
    contentType: string;
  } | null>;

  /**
   * Returns a local filesystem path where external tools (ffmpeg, ffprobe) can
   * read this file. For LocalStorageProvider this is the resolved storage-dir
   * path. When we add a cloud provider, this should download to /tmp and
   * return that path; callers will need a matching cleanup hook then.
   */
  absolutePath(path: string): Promise<string>;

  /**
   * Returns a short-lived URL the browser can PUT a file to directly.
   * For R2: a real S3-presigned URL.
   * For local dev: a same-origin URL handled by a token-validated upload route.
   *
   * The `headers` must be sent verbatim with the PUT request. For R2 the
   * Content-Type must match what was signed, or R2 returns a signature error.
   */
  presignedUpload(
    key: string,
    contentType: string,
    expiresInSeconds?: number,
  ): Promise<{ url: string; headers: Record<string, string> }>;
}
