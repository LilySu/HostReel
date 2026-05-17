CREATE TABLE IF NOT EXISTS "stay_events" (
	"id" text PRIMARY KEY NOT NULL,
	"stay_id" text NOT NULL,
	"type" text NOT NULL,
	"hotspot_id" text,
	"hotspot_content_hash" text,
	"video_id" text,
	"video_time_seconds" integer,
	"ip" text,
	"user_agent" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "stays" (
	"id" text PRIMARY KEY NOT NULL,
	"property_id" text NOT NULL,
	"guest_email" text NOT NULL,
	"guest_name" text NOT NULL,
	"check_in_date" date,
	"host_note" text,
	"magic_token" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"consented_at" timestamp with time zone,
	"consented_ip" text,
	"consented_user_agent" text,
	"completed_at" timestamp with time zone,
	"typed_signature" text,
	"signature_ip" text,
	"receipt_pdf_path" text,
	"audit_hash" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stays_magic_token_unique" UNIQUE("magic_token")
);
--> statement-breakpoint
ALTER TABLE "hotspots" ADD COLUMN "required_acknowledgment" boolean DEFAULT false NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stay_events" ADD CONSTRAINT "stay_events_stay_id_stays_id_fk" FOREIGN KEY ("stay_id") REFERENCES "public"."stays"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stays" ADD CONSTRAINT "stays_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stay_events_stay_idx" ON "stay_events" USING btree ("stay_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stays_property_idx" ON "stays" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stays_magic_idx" ON "stays" USING btree ("magic_token");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stays_status_idx" ON "stays" USING btree ("status");