-- Invite codes are a first name plus digits ("TOLU7", FR-INV-01). Students sign up by email code
-- before they've given a name, so the code made at sign-up is a placeholder ("QZ7"). Give them a
-- real one when the name first arrives in onboarding, as long as nobody has used the placeholder.

create or replace function profiles_identity() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' or new.full_name is distinct from old.full_name then
    new.display_name := display_name_for(new.full_name);
  end if;
  if new.invite_code is null then
    new.invite_code := new_invite_code(new.full_name);
  elsif tg_op = 'UPDATE' and old.full_name is null and new.full_name is not null
        and new.invite_code like 'QZ%'
        and not exists (select 1 from referrals r where r.inviter_id = new.id) then
    new.invite_code := new_invite_code(new.full_name);
  end if;
  return new;
end $$;

-- Existing placeholder codes for students who now have a name.
update profiles p set invite_code = new_invite_code(p.full_name)
where p.full_name is not null and p.invite_code like 'QZ%'
  and length(regexp_replace(split_part(trim(p.full_name), ' ', 1), '[^A-Za-z]', '', 'g')) >= 2
  and not exists (select 1 from referrals r where r.inviter_id = p.id);
