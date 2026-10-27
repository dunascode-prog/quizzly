-- Fix: deleting an account that was ever a course member failed ("Database error deleting
-- user"). Supabase Auth deletes users as `supabase_auth_admin`; the cascade to course_members
-- fires this trigger, which updates course_shares, where that role has no rights. Run it as the
-- owner instead, like the other triggers that write on another table's behalf.
create or replace function course_members_count() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  ids uuid[] := array_remove(array[
    case when tg_op <> 'INSERT' then old.share_id end,
    case when tg_op <> 'DELETE' then new.share_id end], null);
begin
  update course_shares s set member_count =
    (select count(*) from course_members m where m.share_id = s.id and m.status = 'active')
  where s.id = any(ids);
  return null;
end $$;
revoke execute on function course_members_count() from public, anon, authenticated;
