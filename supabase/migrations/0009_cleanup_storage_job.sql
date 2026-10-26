-- FR-SEC-07: Storage removals that fail (document/course deletes, dropping an uploader's copy
-- once the shared copy exists) are retried by a cleanup job.
alter type job_type add value if not exists 'cleanup_storage';
