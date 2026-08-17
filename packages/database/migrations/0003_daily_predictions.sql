CREATE TABLE IF NOT EXISTS daily_predictions(
  id text PRIMARY KEY,
  prediction_date date NOT NULL UNIQUE,
  statement text NOT NULL,
  probability integer NOT NULL CHECK(probability BETWEEN 1 AND 99),
  horizon_hours integer NOT NULL CHECK(horizon_hours BETWEEN 1 AND 720),
  rationale text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '[]',
  evidence_count integer NOT NULL DEFAULT 0,
  scope text NOT NULL CHECK(scope IN ('turkey','world','mixed')),
  category text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','approved','published','resolved','rejected','insufficient_evidence')),
  generated_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  published_at timestamptz,
  x_post_id text,
  outcome text CHECK(outcome IN ('correct','incorrect','ambiguous')),
  resolution_note text,
  resolved_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS daily_predictions_date_idx ON daily_predictions(prediction_date DESC);
