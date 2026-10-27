-- C6: who may study a document, and reporting shared courses (FR-SHARE-02/05, FR-DOC-12,
-- FR-MOD-05).

-- The owner, or an active member of an active share of the document's course, and then only once
-- the document is ready (FR-SHARE-08). Used by the API for every read of a document's derived
-- content; writes stay owner-only. Server side only: clients never call it.
create or replace function can_read_document(doc uuid, uid uuid) returns boolean
language sql stable set search_path = public as $$
  select exists (
    select 1 from documents d
    where d.id = doc and d.deleted_at is null
      and (
        d.user_id = uid
        or (
          d.status = 'ready' and d.course_id is not null
          and exists (
            select 1 from course_shares s join course_members m on m.share_id = s.id
            where s.course_id = d.course_id and s.status = 'active'
              and m.user_id = uid and m.status = 'active'
          )
        )
      )
  )
$$;
revoke execute on function can_read_document(uuid, uuid) from public, anon, authenticated;

-- The same rule as a set, for lists (Library, Daily 5, Today's plan): the student's documents plus
-- the ready documents of courses shared with them. Index-friendly, unlike calling the function above
-- per row.
create or replace function readable_documents(uid uuid) returns setof uuid
language sql stable set search_path = public as $$
  select d.id from documents d where d.user_id = uid and d.deleted_at is null
  union
  select d.id
  from course_members m
  join course_shares s on s.id = m.share_id and s.status = 'active'
  join documents d on d.course_id = s.course_id and d.status = 'ready' and d.deleted_at is null
  where m.user_id = uid and m.status = 'active'
$$;
revoke execute on function readable_documents(uuid) from public, anon, authenticated;
create index if not exists documents_course on documents (course_id) where deleted_at is null;

-- Members can report a shared course (copyright, wrong content, spam).
alter type report_target add value if not exists 'course';
alter type report_reason add value if not exists 'copyright';
alter type report_reason add value if not exists 'spam';
