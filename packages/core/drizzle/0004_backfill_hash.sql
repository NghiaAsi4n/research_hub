-- Backfill content hash for documents published before T9 introduced exact content identity.
-- A legacy row keeps the hash of its source fingerprint, so the same clean Markdown can exist
-- under several hashes. This function replaces that hash with the hash of the stored Markdown and
-- folds a duplicate into the canonical row, reusing the same merge rules as rh_finish_document.
--
-- It is idempotent: a second call with the same hash returns the row unchanged. Ready content is
-- never rewritten, only re-keyed, because the Markdown object itself is untouched.
CREATE FUNCTION rh_backfill_document_hash(p_id uuid, p_hash text)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  original documents%ROWTYPE;
  canonical uuid;
BEGIN
  IF p_hash !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Invalid content hash'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_hash, 0));
  SELECT * INTO original FROM documents WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF original.status <> 'ready' THEN RETURN NULL; END IF;
  IF original.hash = p_hash THEN RETURN p_id; END IF;

  SELECT id INTO canonical FROM documents WHERE hash = p_hash AND id <> p_id;
  IF canonical IS NULL THEN
    UPDATE documents SET hash = p_hash WHERE id = p_id;
    RETURN p_id;
  END IF;

  -- Only a published canonical row may absorb another document.
  IF NOT EXISTS (SELECT 1 FROM documents WHERE id = canonical AND status = 'ready') THEN
    RETURN NULL;
  END IF;

  INSERT INTO document_sources (document_id, source_id)
    SELECT canonical, source_id FROM document_sources WHERE document_id = p_id ON CONFLICT DO NOTHING;
  IF original.source_id IS NOT NULL THEN
    INSERT INTO document_sources (document_id, source_id)
      VALUES (canonical, original.source_id) ON CONFLICT DO NOTHING;
  END IF;
  INSERT INTO document_aliases (id, document_id) VALUES (p_id, canonical) ON CONFLICT DO NOTHING;
  UPDATE document_aliases SET document_id = canonical WHERE document_id = p_id;
  INSERT INTO reading_progress (document_id, user_id, section, ratio, updated_at)
    SELECT canonical, user_id, section, ratio, updated_at
    FROM reading_progress WHERE document_id = p_id
    ON CONFLICT DO NOTHING;
  INSERT INTO highlights (document_id, user_id, start_offset, end_offset, quote, created_at)
    SELECT canonical, user_id, start_offset, end_offset, quote, created_at
    FROM highlights WHERE document_id = p_id
    ON CONFLICT DO NOTHING;
  UPDATE jobs SET payload = jsonb_set(payload, '{documentId}', to_jsonb(canonical::text)),
    idem_key = 'ingest:content:' || p_hash || ':discovery:' || id::text
    WHERE type = 'ingest' AND payload->>'documentId' = p_id::text;
  DELETE FROM documents WHERE id = p_id;
  RETURN canonical;
END;
$$;
