ALTER TABLE "jobs" ALTER COLUMN "idem_key" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "pages" integer;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE INDEX "jobs_lease_expires_at_idx" ON "jobs" USING btree ("lease_expires_at");