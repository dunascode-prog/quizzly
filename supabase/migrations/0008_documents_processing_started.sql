-- FR-SEC-05: deleting a document gives the daily upload back only if it was never processed.
-- The worker sets this when processing starts (including instant duplicates of a known file).
alter table documents add column processing_started_at timestamptz;

-- Documents already past "uploaded" have been processed (or tried): no refund for them.
update documents set processing_started_at = created_at
where status not in ('awaiting_upload', 'uploaded') and processing_started_at is null;
