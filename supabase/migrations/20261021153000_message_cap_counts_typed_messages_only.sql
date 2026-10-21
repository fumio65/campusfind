-- ISSC drop-off markers (suggest / request / decline) no longer count toward
-- the 10 typed-message cap, so a full chat can still arrange a drop-off.
-- Markers get their own cap of 20 to prevent spam.
create or replace function public.enforce_message_cap()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare
  is_marker boolean := new.body in ('📍 ISSC_DROPOFF', '🔔 ISSC_DROPOFF_REQUESTED', '🚫 ISSC_DROPOFF_DECLINED');
  typed_count int;
  marker_count int;
begin
  if is_marker then
    select count(*) into marker_count
    from claim_messages
    where claim_id = new.claim_id
      and body in ('📍 ISSC_DROPOFF', '🔔 ISSC_DROPOFF_REQUESTED', '🚫 ISSC_DROPOFF_DECLINED');
    if marker_count >= 20 then
      raise exception 'Claim % has reached the drop-off request limit', new.claim_id;
    end if;
    return new;
  end if;

  select count(*) into typed_count
  from claim_messages
  where claim_id = new.claim_id
    and body not in ('📍 ISSC_DROPOFF', '🔔 ISSC_DROPOFF_REQUESTED', '🚫 ISSC_DROPOFF_DECLINED');

  if typed_count >= 10 then
    raise exception 'Claim % has reached the 10-message cap', new.claim_id;
  end if;

  return new;
end;
$function$;
