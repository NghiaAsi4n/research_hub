CREATE TABLE "ollama_queue_requests" (
	"seq" bigserial PRIMARY KEY NOT NULL,
	"id" uuid NOT NULL,
	"lane" text NOT NULL,
	"status" text DEFAULT 'waiting' NOT NULL,
	"deadline_at" timestamp with time zone NOT NULL,
	"lease_owner" text,
	"lease_expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ollama_slots" (
	"slot_name" text PRIMARY KEY NOT NULL,
	"request_id" uuid,
	"lease_owner" text,
	"lease_expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "ollama_queue_requests_id_idx" ON "ollama_queue_requests" USING btree ("id");--> statement-breakpoint
CREATE INDEX "ollama_queue_requests_status_seq_idx" ON "ollama_queue_requests" USING btree ("status","seq");--> statement-breakpoint
INSERT INTO "ollama_slots" ("slot_name") VALUES ('ollama') ON CONFLICT ("slot_name") DO NOTHING;
