-- FR-SEC-03 / FR-SEC-06: a file that crashes the worker on every attempt fails with reason
-- `crashed` (documents.failure_reason is text; source_files uses this enum).
alter type failure_reason add value if not exists 'crashed';
