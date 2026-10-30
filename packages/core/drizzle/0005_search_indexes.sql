-- Bỏ dấu tiếng Việt bằng translate() thay vì extension unaccent: kết quả giống nhau ở Neon và
-- PGlite, nên test chạy được đúng câu SQL dùng trong truy vấn thật (Giai đoạn 2, T3).
CREATE OR REPLACE FUNCTION rh_unaccent(input text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
  SELECT translate(
    lower(input),
    'áàảãạăắằẳẵặâấầẩẫậéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵđ',
    'aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyyd'
  )
$$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS chunks_tsv_simple_idx ON chunks USING gin (to_tsvector('simple', rh_unaccent(text)));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS chunks_embedding_hnsw_idx ON chunks USING hnsw (embedding vector_cosine_ops);
