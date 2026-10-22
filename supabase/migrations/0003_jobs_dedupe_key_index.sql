-- The app reads each document's processing progress from its latest job, looked up by
-- dedupe_key ('ingest:<document id>'). jobs_dedupe_active only covers queued/running jobs.
create index if not exists jobs_dedupe_key on jobs (dedupe_key, created_at desc);
