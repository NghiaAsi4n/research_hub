ALTER TABLE "runs" ADD COLUMN "owner_id" text;--> statement-breakpoint
CREATE INDEX "runs_owner_started_idx" ON "runs" USING btree ("owner_id","started_at");