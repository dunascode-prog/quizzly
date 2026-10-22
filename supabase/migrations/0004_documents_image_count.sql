-- Photo uploads (FR-DOC-01): 1–30 images stored as page-001.jpg … in the document's upload
-- folder (upload_path ends in "/"). The count lets the app retry an unfinished upload.
alter table documents
  add column if not exists image_count smallint check (image_count between 1 and 30);
