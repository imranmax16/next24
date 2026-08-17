ALTER TABLE daily_predictions ADD COLUMN IF NOT EXISTS counterargument text;
ALTER TABLE daily_predictions ADD COLUMN IF NOT EXISTS resolution_criteria text;
ALTER TABLE daily_predictions ADD COLUMN IF NOT EXISTS model_provider text;
ALTER TABLE daily_predictions ADD COLUMN IF NOT EXISTS model_name text;
