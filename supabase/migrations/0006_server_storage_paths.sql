-- FR-SEC-02 / FR-SEC-17: the server owns storage paths, and an upload must arrive within 10
-- minutes of its signed URL being issued (Supabase fixes the URL itself at 2 hours, so the API
-- checks the object's creation time against this column).
alter table documents add column upload_url_issued_at timestamptz;

-- A document row can only point inside its owner's folder for that document.
alter table documents add constraint documents_upload_path_owned
  check (upload_path like 'uploads/' || user_id::text || '/' || id::text || '/%');
