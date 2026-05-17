import { z } from 'zod';

// ---------- Property ----------

export const createPropertySchema = z.object({
  name: z.string().trim().min(1).max(80),
});
export type CreatePropertyInput = z.infer<typeof createPropertySchema>;

export const updatePropertySchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
});
export type UpdatePropertyInput = z.infer<typeof updatePropertySchema>;

export const publishPropertySchema = z.object({
  published: z.boolean(),
});
export type PublishPropertyInput = z.infer<typeof publishPropertySchema>;

// ---------- Section ----------

export const createSectionSchema = z.object({
  propertyId: z.string().min(1),
  title: z.string().trim().min(1).max(60),
});
export type CreateSectionInput = z.infer<typeof createSectionSchema>;

export const updateSectionSchema = z.object({
  title: z.string().trim().min(1).max(60).optional(),
  orderIndex: z.number().int().min(0).optional(),
});
export type UpdateSectionInput = z.infer<typeof updateSectionSchema>;

// ---------- Video ----------

export const VIDEO_MIME_TYPES = ['video/mp4', 'video/quicktime'] as const;
export const VIDEO_EXTENSIONS = ['.mp4', '.mov'] as const;
export const MAX_VIDEO_DURATION_SECONDS = Number(
  process.env.MAX_VIDEO_DURATION_SECONDS ?? 300,
);
export const MAX_VIDEO_FILE_BYTES =
  Number(process.env.MAX_VIDEO_FILE_MB ?? 500) * 1024 * 1024;

export const createVideoSchema = z.object({
  propertyId: z.string().min(1),
  sectionId: z.string().min(1).nullable().optional(),
  title: z.string().trim().min(1).max(60),
  description: z.string().trim().max(500).optional().nullable(),
  // The presigned upload flow needs both the MIME and size up-front so the
  // server can refuse before issuing a URL. The browser still does its own
  // pre-flight check for UX, but the server is the only gate that matters.
  contentType: z.enum([...VIDEO_MIME_TYPES] as [string, ...string[]]),
  sizeBytes: z.number().int().positive().max(MAX_VIDEO_FILE_BYTES),
});
export type CreateVideoInput = z.infer<typeof createVideoSchema>;

export const updateVideoSchema = z.object({
  title: z.string().trim().min(1).max(60).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  orderIndex: z.number().int().min(0).optional(),
  sectionId: z.string().min(1).nullable().optional(),
});
export type UpdateVideoInput = z.infer<typeof updateVideoSchema>;

export function extForContentType(t: string): '.mp4' | '.mov' {
  return t === 'video/mp4' ? '.mp4' : '.mov';
}

// ---------- Hotspot ----------

export const HOTSPOT_ICONS = [
  'wifi',
  'appliance',
  'outdoor',
  'trash',
  'key',
  'parking',
  'other',
] as const;
export type HotspotIcon = (typeof HOTSPOT_ICONS)[number];

// Per UX guidance: soft warnings, not errors. A host can save a hotspot with
// empty instructions (we'll show "no instructions" in the editor) and fill in
// the prose later. Title is still required for the list to be scannable.
export const createHotspotSchema = z.object({
  videoId: z.string().min(1),
  timestampSeconds: z.number().int().min(0),
  title: z.string().trim().min(1).max(40),
  icon: z.enum(HOTSPOT_ICONS).default('other'),
  instructionsMd: z.string().max(2000).default(''),
  requiredAcknowledgment: z.boolean().optional(),
});
export type CreateHotspotInput = z.infer<typeof createHotspotSchema>;

export const updateHotspotSchema = z.object({
  timestampSeconds: z.number().int().min(0).optional(),
  title: z.string().trim().min(1).max(40).optional(),
  icon: z.enum(HOTSPOT_ICONS).optional(),
  instructionsMd: z.string().max(2000).optional(),
  orderIndex: z.number().int().min(0).optional(),
  requiredAcknowledgment: z.boolean().optional(),
});
export type UpdateHotspotInput = z.infer<typeof updateHotspotSchema>;

// ---------- Stays ----------

export const createStaySchema = z.object({
  propertyId: z.string().min(1),
  guestName: z.string().trim().min(1).max(80),
  guestEmail: z.string().trim().email().max(254),
  checkInDate: z.string().date().nullable().optional(),
  hostNote: z.string().trim().max(500).optional(),
  expiresInDays: z.number().int().positive().max(365).optional(),
});
export type CreateStayInput = z.infer<typeof createStaySchema>;

export const stayEventSchema = z.object({
  type: z.enum([
    'link_opened',
    'consent_given',
    'video_played',
    'video_paused',
    'hotspot_viewed',
    'hotspot_acknowledged',
  ]),
  hotspotId: z.string().min(1).optional(),
  videoId: z.string().min(1).optional(),
  videoTimeSeconds: z.number().int().min(0).optional(),
});
export type StayEventInput = z.infer<typeof stayEventSchema>;

export const completeStaySchema = z.object({
  typedSignature: z.string().trim().min(2).max(80),
});
export type CompleteStayInput = z.infer<typeof completeStaySchema>;

// ---------- Photo ----------

export const PHOTO_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const MAX_PHOTO_FILE_BYTES =
  Number(process.env.MAX_PHOTO_FILE_MB ?? 5) * 1024 * 1024;
export const MAX_PHOTOS_PER_HOTSPOT = 3;
