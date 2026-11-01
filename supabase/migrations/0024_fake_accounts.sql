-- Fake-account defence (FR-SEC-23..25): one Quizzly account per real inbox. Gmail ignores dots and
-- "+tags", and "+tags" are dropped everywhere, so tolu+1@gmail.com and t.o.l.u@gmail.com are the
-- same inbox as tolu@gmail.com. The API sets this when onboarding finishes and refuses a second
-- account for the same inbox; throwaway domains are refused there too.

create function normalize_email(e text) returns text
language sql immutable as $$
  select case
    when split_part(lower(e), '@', 2) in ('gmail.com', 'googlemail.com')
      then replace(split_part(split_part(lower(e), '@', 1), '+', 1), '.', '') || '@gmail.com'
    else split_part(split_part(lower(e), '@', 1), '+', 1) || '@' || split_part(lower(e), '@', 2)
  end
$$;

alter table profiles add column email_normalized text;

-- Existing accounts: the oldest account keeps an inbox; later look-alikes stay unset (they can keep
-- studying, but a new look-alike can't be made).
update profiles p set email_normalized = normalize_email(u.email)
from auth.users u
where u.id = p.id and p.deleted_at is null and u.email is not null
  and not exists (
    select 1 from profiles q join auth.users v on v.id = q.id
    where q.id <> p.id and q.deleted_at is null and v.email is not null
      and normalize_email(v.email) = normalize_email(u.email) and q.created_at < p.created_at
  );

create unique index profiles_email_normalized on profiles (email_normalized)
  where deleted_at is null and email_normalized is not null;
