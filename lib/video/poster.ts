import 'server-only';
import ffmpeg from 'fluent-ffmpeg';
import path from 'node:path';
import os from 'node:os';
import fsp from 'node:fs/promises';
import { randomBytes } from 'node:crypto';

/**
 * Extracts a single frame from the input video and returns it as a JPEG Buffer.
 * Default timestamp: 1 second in (avoids black/blurred first frames).
 *
 * Requires `ffmpeg` on PATH.
 */
export async function extractPosterFrame(
  absoluteVideoPath: string,
  atSeconds = 1,
): Promise<Buffer> {
  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'poster-'));
  const tmpFile = path.join(tmpDir, `${randomBytes(8).toString('hex')}.jpg`);

  try {
    await new Promise<void>((resolve, reject) => {
      ffmpeg(absoluteVideoPath)
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .screenshots({
          timestamps: [atSeconds],
          filename: path.basename(tmpFile),
          folder: tmpDir,
          size: '1280x?',
        });
    });

    return await fsp.readFile(tmpFile);
  } finally {
    await fsp.rm(tmpDir, { recursive: true, force: true });
  }
}
