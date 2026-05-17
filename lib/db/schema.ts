import {
  pgTable,
  text,
  integer,
  timestamp,
  boolean,
  date,
  index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const properties = pgTable(
  'properties',
  {
    id: text('id').primaryKey(),
    clerkUserId: text('clerk_user_id').notNull(),
    name: text('name').notNull(),
    shareSlug: text('share_slug').notNull().unique(),
    published: boolean('published').notNull().default(false),
    coverImagePath: text('cover_image_path'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    clerkUserIdx: index('properties_clerk_user_idx').on(t.clerkUserId),
    shareSlugIdx: index('properties_share_slug_idx').on(t.shareSlug),
  }),
);

export const sections = pgTable(
  'sections',
  {
    id: text('id').primaryKey(),
    propertyId: text('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    orderIndex: integer('order_index').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    propertyIdx: index('sections_property_idx').on(t.propertyId),
  }),
);

export const videos = pgTable(
  'videos',
  {
    id: text('id').primaryKey(),
    propertyId: text('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    sectionId: text('section_id').references(() => sections.id, {
      onDelete: 'set null',
    }),
    title: text('title').notNull(),
    description: text('description'),
    orderIndex: integer('order_index').notNull().default(0),
    storagePath: text('storage_path').notNull(),
    durationSeconds: integer('duration_seconds').notNull(),
    widthPx: integer('width_px'),
    heightPx: integer('height_px'),
    posterPath: text('poster_path'),
    status: text('status', {
      enum: ['uploading', 'processing', 'ready', 'failed'],
    })
      .notNull()
      .default('uploading'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    propertyIdx: index('videos_property_idx').on(t.propertyId),
    sectionIdx: index('videos_section_idx').on(t.sectionId),
  }),
);

export const hotspots = pgTable(
  'hotspots',
  {
    id: text('id').primaryKey(),
    videoId: text('video_id')
      .notNull()
      .references(() => videos.id, { onDelete: 'cascade' }),
    timestampSeconds: integer('timestamp_seconds').notNull(),
    title: text('title').notNull(),
    icon: text('icon', {
      enum: ['wifi', 'appliance', 'outdoor', 'trash', 'key', 'parking', 'other'],
    })
      .notNull()
      .default('other'),
    instructionsMd: text('instructions_md').notNull(),
    orderIndex: integer('order_index').notNull().default(0),
    requiredAcknowledgment: boolean('required_acknowledgment')
      .notNull()
      .default(false),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    videoIdx: index('hotspots_video_idx').on(t.videoId),
  }),
);

export const hotspotPhotos = pgTable('hotspot_photos', {
  id: text('id').primaryKey(),
  hotspotId: text('hotspot_id')
    .notNull()
    .references(() => hotspots.id, { onDelete: 'cascade' }),
  storagePath: text('storage_path').notNull(),
  orderIndex: integer('order_index').notNull().default(0),
});

// ---------- Stays (invitation-only verified guest check-in) ----------

export const stays = pgTable(
  'stays',
  {
    id: text('id').primaryKey(),
    propertyId: text('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    guestEmail: text('guest_email').notNull(),
    guestName: text('guest_name').notNull(),
    checkInDate: date('check_in_date'),
    hostNote: text('host_note'),
    magicToken: text('magic_token').notNull().unique(),
    status: text('status', {
      enum: ['pending', 'viewed', 'in_progress', 'completed', 'expired'],
    })
      .notNull()
      .default('pending'),
    consentedAt: timestamp('consented_at', { withTimezone: true }),
    consentedIp: text('consented_ip'),
    consentedUserAgent: text('consented_user_agent'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    typedSignature: text('typed_signature'),
    signatureIp: text('signature_ip'),
    receiptPdfPath: text('receipt_pdf_path'),
    auditHash: text('audit_hash'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    propertyIdx: index('stays_property_idx').on(t.propertyId),
    magicIdx: index('stays_magic_idx').on(t.magicToken),
    statusIdx: index('stays_status_idx').on(t.status),
  }),
);

// Append-only audit log. Hard rule 20: never UPDATE or DELETE rows here.
export const stayEvents = pgTable(
  'stay_events',
  {
    id: text('id').primaryKey(),
    stayId: text('stay_id')
      .notNull()
      .references(() => stays.id, { onDelete: 'cascade' }),
    type: text('type', {
      enum: [
        'link_opened',
        'consent_given',
        'video_played',
        'video_paused',
        'hotspot_viewed',
        'hotspot_acknowledged',
        'signature_typed',
        'completed',
      ],
    }).notNull(),
    hotspotId: text('hotspot_id'),
    hotspotContentHash: text('hotspot_content_hash'),
    // Snapshot the content the guest actually saw at acknowledgment time so
    // the PDF / verification page can show that text verbatim even after the
    // host edits the hotspot. The hash above is the integrity check; these
    // columns hold the readable copy.
    hotspotTitleAtAck: text('hotspot_title_at_ack'),
    hotspotInstructionsAtAck: text('hotspot_instructions_at_ack'),
    videoId: text('video_id'),
    videoTimeSeconds: integer('video_time_seconds'),
    ip: text('ip'),
    userAgent: text('user_agent'),
    occurredAt: timestamp('occurred_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    stayIdx: index('stay_events_stay_idx').on(t.stayId),
  }),
);

// Relations
export const propertiesRelations = relations(properties, ({ many }) => ({
  sections: many(sections),
  videos: many(videos),
  stays: many(stays),
}));

export const staysRelations = relations(stays, ({ one, many }) => ({
  property: one(properties, {
    fields: [stays.propertyId],
    references: [properties.id],
  }),
  events: many(stayEvents),
}));

export const stayEventsRelations = relations(stayEvents, ({ one }) => ({
  stay: one(stays, {
    fields: [stayEvents.stayId],
    references: [stays.id],
  }),
}));

export const sectionsRelations = relations(sections, ({ one, many }) => ({
  property: one(properties, {
    fields: [sections.propertyId],
    references: [properties.id],
  }),
  videos: many(videos),
}));

export const videosRelations = relations(videos, ({ one, many }) => ({
  property: one(properties, {
    fields: [videos.propertyId],
    references: [properties.id],
  }),
  section: one(sections, {
    fields: [videos.sectionId],
    references: [sections.id],
  }),
  hotspots: many(hotspots),
}));

export const hotspotsRelations = relations(hotspots, ({ one, many }) => ({
  video: one(videos, {
    fields: [hotspots.videoId],
    references: [videos.id],
  }),
  photos: many(hotspotPhotos),
}));

export const hotspotPhotosRelations = relations(hotspotPhotos, ({ one }) => ({
  hotspot: one(hotspots, {
    fields: [hotspotPhotos.hotspotId],
    references: [hotspots.id],
  }),
}));

// Type exports
export type Property = typeof properties.$inferSelect;
export type NewProperty = typeof properties.$inferInsert;
export type Section = typeof sections.$inferSelect;
export type NewSection = typeof sections.$inferInsert;
export type Video = typeof videos.$inferSelect;
export type NewVideo = typeof videos.$inferInsert;
export type Hotspot = typeof hotspots.$inferSelect;
export type NewHotspot = typeof hotspots.$inferInsert;
export type HotspotPhoto = typeof hotspotPhotos.$inferSelect;
export type NewHotspotPhoto = typeof hotspotPhotos.$inferInsert;
export type Stay = typeof stays.$inferSelect;
export type NewStay = typeof stays.$inferInsert;
export type StayEvent = typeof stayEvents.$inferSelect;
export type NewStayEvent = typeof stayEvents.$inferInsert;
