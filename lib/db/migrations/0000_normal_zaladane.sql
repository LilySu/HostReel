CREATE TABLE IF NOT EXISTS "hotspot_photos" (
	"id" text PRIMARY KEY NOT NULL,
	"hotspot_id" text NOT NULL,
	"storage_path" text NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hotspots" (
	"id" text PRIMARY KEY NOT NULL,
	"video_id" text NOT NULL,
	"timestamp_seconds" integer NOT NULL,
	"title" text NOT NULL,
	"icon" text DEFAULT 'other' NOT NULL,
	"instructions_md" text NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "properties" (
	"id" text PRIMARY KEY NOT NULL,
	"clerk_user_id" text NOT NULL,
	"name" text NOT NULL,
	"share_slug" text NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "properties_share_slug_unique" UNIQUE("share_slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sections" (
	"id" text PRIMARY KEY NOT NULL,
	"property_id" text NOT NULL,
	"title" text NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "videos" (
	"id" text PRIMARY KEY NOT NULL,
	"property_id" text NOT NULL,
	"section_id" text,
	"title" text NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"storage_path" text NOT NULL,
	"duration_seconds" integer NOT NULL,
	"width_px" integer,
	"height_px" integer,
	"poster_path" text,
	"status" text DEFAULT 'uploading' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "hotspot_photos" ADD CONSTRAINT "hotspot_photos_hotspot_id_hotspots_id_fk" FOREIGN KEY ("hotspot_id") REFERENCES "public"."hotspots"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "hotspots" ADD CONSTRAINT "hotspots_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sections" ADD CONSTRAINT "sections_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "videos" ADD CONSTRAINT "videos_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "videos" ADD CONSTRAINT "videos_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hotspots_video_idx" ON "hotspots" USING btree ("video_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "properties_clerk_user_idx" ON "properties" USING btree ("clerk_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "properties_share_slug_idx" ON "properties" USING btree ("share_slug");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sections_property_idx" ON "sections" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "videos_property_idx" ON "videos" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "videos_section_idx" ON "videos" USING btree ("section_id");