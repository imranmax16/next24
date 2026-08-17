CREATE TABLE IF NOT EXISTS x_publications(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key text NOT NULL UNIQUE,
  candidate_id text NOT NULL,
  cluster_id text,
  text text NOT NULL,
  headline text NOT NULL,
  headline_fingerprint text NOT NULL,
  source_article_url text NOT NULL,
  weighted_character_count integer NOT NULL,
  status text NOT NULL CHECK(status IN ('dry_run','publishing','published','duplicate','failed')),
  automatic boolean NOT NULL DEFAULT false,
  x_post_id text UNIQUE,
  x_post_url text,
  published_at timestamptz,
  attempt_count integer NOT NULL DEFAULT 0,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS x_publications_duplicate_idx ON x_publications(headline_fingerprint,created_at DESC) WHERE status='published';
CREATE INDEX IF NOT EXISTS x_publications_source_url_idx ON x_publications(source_article_url,created_at DESC) WHERE status='published';
CREATE INDEX IF NOT EXISTS x_publications_status_idx ON x_publications(status,created_at DESC);
