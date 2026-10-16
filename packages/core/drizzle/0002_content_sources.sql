CREATE TABLE "document_aliases" (
	"id" uuid PRIMARY KEY NOT NULL,
	"document_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_sources" (
	"document_id" uuid NOT NULL,
	"source_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "document_aliases" ADD CONSTRAINT "document_aliases_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_sources" ADD CONSTRAINT "document_sources_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_sources" ADD CONSTRAINT "document_sources_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "document_sources_idx" ON "document_sources" USING btree ("document_id","source_id");--> statement-breakpoint
INSERT INTO document_sources (document_id, source_id)
SELECT id, source_id FROM documents WHERE source_id IS NOT NULL ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- This function runs as one transaction on neon-http. The hash lock serializes
-- publication, while the row lock prevents two completions rewriting one document.
CREATE FUNCTION rh_finish_document(p_id uuid, p_hash text, p_fields jsonb)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  original documents%ROWTYPE;
  canonical uuid;
BEGIN
  IF p_hash !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Invalid content hash'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_hash, 0));
  SELECT * INTO original FROM documents WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    SELECT document_id INTO canonical FROM document_aliases WHERE id = p_id;
    IF canonical IS NULL THEN RAISE EXCEPTION 'Document not found'; END IF;
    RETURN canonical;
  END IF;
  IF original.status = 'ready' AND original.hash <> p_hash THEN
    RAISE EXCEPTION 'Published content is immutable';
  END IF;
  SELECT id INTO canonical FROM documents WHERE hash = p_hash AND id <> p_id;
  IF canonical IS NULL THEN
    canonical := p_id;
    UPDATE documents SET hash = p_hash, status = 'ready',
      title = COALESCE(p_fields->>'title', title),
      bytes = COALESCE((p_fields->>'bytes')::integer, bytes),
      pages = COALESCE((p_fields->>'pages')::integer, pages),
      meta = COALESCE(p_fields->'meta', meta)
    WHERE id = p_id;
  ELSE
    -- A canonical row must have its Markdown before a pending PDF can be merged.
    IF NOT EXISTS (SELECT 1 FROM documents WHERE id = canonical AND status = 'ready') THEN
      RAISE EXCEPTION 'Canonical content is still being published; retry';
    END IF;
    INSERT INTO document_sources (document_id, source_id)
      SELECT canonical, source_id FROM document_sources WHERE document_id = p_id ON CONFLICT DO NOTHING;
    INSERT INTO document_aliases (id, document_id) VALUES (p_id, canonical) ON CONFLICT DO NOTHING;
    UPDATE document_aliases SET document_id = canonical WHERE document_id = p_id;
  END IF;
  IF original.source_id IS NOT NULL THEN
    INSERT INTO document_sources (document_id, source_id) VALUES (canonical, original.source_id) ON CONFLICT DO NOTHING;
  END IF;
  -- Keep the original leased discovery jobs so the worker can finish its lease.
  -- No downstream processing job is scheduled for a duplicate. Each historical
  -- part keeps its identity, now namespaced by the canonical content hash.
  UPDATE jobs SET payload = jsonb_set(payload, '{documentId}', to_jsonb(canonical::text)),
    idem_key = 'ingest:content:' || p_hash || ':discovery:' || id::text
    WHERE type = 'ingest' AND payload->>'documentId' = p_id::text;
  IF canonical <> p_id THEN DELETE FROM documents WHERE id = p_id; END IF;
  RETURN canonical;
END;
$$;
