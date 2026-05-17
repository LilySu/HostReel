import 'server-only';
import ffmpeg from 'fluent-ffmpeg';

export interface VideoProbeResult {
  durationSeconds: number;
  widthPx: number;
  heightPx: number;
}

/**
 * Returns duration (rounded down to integer seconds) plus width and height of
 * the first video stream in the file.
 *
 * Throws if ffprobe fails or the file has no readable video stream.
 *
 * Requires `ffprobe` on PATH. See README for install instructions.
 */
export function probeVideo(absoluteFilePath: string): Promise<VideoProbeResult> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(absoluteFilePath, (err, metadata) => {
      if (err) {
        reject(err);
        return;
      }
      const duration = metadata?.format?.duration;
      if (typeof duration !== 'number' || !Number.isFinite(duration)) {
        reject(new Error('ffprobe did not return a numeric duration'));
        return;
      }
      const videoStream = metadata.streams?.find((s) => s.codec_type === 'video');
      if (!videoStream) {
        reject(new Error('No video stream in file'));
        return;
      }
      const width = videoStream.width;
      const height = videoStream.height;
      if (typeof width !== 'number' || typeof height !== 'number') {
        reject(new Error('ffprobe did not return numeric width/height'));
        return;
      }
      resolve({
        durationSeconds: Math.floor(duration),
        widthPx: width,
        heightPx: height,
      });
    });
  });
}
