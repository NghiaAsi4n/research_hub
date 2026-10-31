CREATE TABLE "watchlist_snapshots" (
	"watchlist_id" uuid NOT NULL,
	"url" text NOT NULL,
	"content_hash" text NOT NULL,
	"text" text NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "watchlist_snapshots_watchlist_id_url_pk" PRIMARY KEY("watchlist_id","url")
);
--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "tags" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "payload" jsonb;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "read_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "watchlist_snapshots" ADD CONSTRAINT "watchlist_snapshots_watchlist_id_watchlist_id_fk" FOREIGN KEY ("watchlist_id") REFERENCES "public"."watchlist"("id") ON DELETE cascade ON UPDATE no action;