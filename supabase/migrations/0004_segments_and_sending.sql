-- Saved segments and everything a broadcast needs to send. Who can receive email is
-- decided here, in one function, so the live count and the real send can't disagree.

-- A person is in a segment if they match its rules or were added by hand.
create table segments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  rules jsonb not null default '{}',
  created_by uuid references team_members (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table segment_members (
  segment_id uuid not null references segments (id) on delete cascade,
  subscriber_id uuid not null references subscribers (id) on delete cascade,
  added_by text,
  added_at timestamptz not null default now(),
  primary key (segment_id, subscriber_id)
);

create index segment_members_subscriber_idx on segment_members (subscriber_id);

alter table segments enable row level security;
create policy team_members_only on segments for all to authenticated using (is_team_member()) with check (is_team_member());
alter table segment_members enable row level security;
create policy team_members_only on segment_members for all to authenticated using (is_team_member()) with check (is_team_member());

-- Rules: within a field any value matches, and every field that has values must match.
-- No rules at all matches nobody, so an empty segment can never mean "everyone".
create function jsonb_text_array(value jsonb) returns text[]
language sql immutable set search_path = public as $$
  select coalesce(array(select jsonb_array_elements_text(case when jsonb_typeof(value) = 'array' then value else '[]'::jsonb end)), '{}')
$$;

create function subscriber_matches_rules(s subscribers, rules jsonb) returns boolean
language sql stable set search_path = public as $$
  with r as (
    select
      jsonb_text_array(rules -> 'statuses') as statuses,
      jsonb_text_array(rules -> 'airtable_segments') as airtable_segments,
      jsonb_text_array(rules -> 'trip_types') as trip_types,
      jsonb_text_array(rules -> 'departure_windows') as departure_windows,
      jsonb_text_array(rules -> 'group_sizes') as group_sizes,
      jsonb_text_array(rules -> 'interests') as interests,
      jsonb_text_array(rules -> 'objections') as objections,
      jsonb_text_array(rules -> 'account_owners') as account_owners,
      jsonb_text_array(rules -> 'keywords') as keywords
  )
  select
    (statuses || airtable_segments || trip_types || departure_windows || group_sizes
      || interests || objections || account_owners || keywords) <> '{}'
    and (statuses = '{}' or s.status = any (statuses))
    and (airtable_segments = '{}' or s.segments && airtable_segments)
    and (trip_types = '{}' or s.trip_type = any (trip_types))
    and (departure_windows = '{}' or s.departure_window = any (departure_windows))
    and (group_sizes = '{}' or s.group_size = any (group_sizes))
    and (interests = '{}' or s.interests && interests)
    and (objections = '{}' or s.objections && objections)
    and (account_owners = '{}' or s.account_owner = any (account_owners))
    and (keywords = '{}' or exists (
      select 1 from unnest(keywords) keyword
      where position(
        lower(keyword) in lower(concat_ws(' ', s.interests_other, s.objections_other, s.source))
      ) > 0
    ))
  from r
$$;

create function segment_subscribers(target uuid) returns setof subscribers
language sql stable set search_path = public as $$
  select s.*
  from subscribers s, segments g
  where g.id = target
    and (
      subscriber_matches_rules(s, g.rules)
      or exists (select 1 from segment_members m where m.segment_id = g.id and m.subscriber_id = s.id)
    )
$$;

-- How many people a set of rules would match, ignoring opt-outs. For the live count in the editor.
create function count_rule_matches(rules jsonb) returns bigint
language sql stable set search_path = public as $$
  select count(*) from subscribers s where subscriber_matches_rules(s, rules)
$$;

-- Who a broadcast reaches: anyone in at least one chosen segment, status or Airtable
-- segment. Unsubscribed and suppressed people are removed here and nowhere else.
create function broadcast_audience(filter jsonb) returns setof subscribers
language sql stable set search_path = public as $$
  select s.*
  from subscribers s
  where s.unsubscribed_at is null
    and not s.suppressed
    and (
      s.status = any (jsonb_text_array(filter -> 'statuses'))
      or s.segments && jsonb_text_array(filter -> 'airtable_segments')
      or exists (
        select 1 from segments g
        where g.id::text = any (jsonb_text_array(filter -> 'segment_ids'))
          and (
            subscriber_matches_rules(s, g.rules)
            or exists (select 1 from segment_members m where m.segment_id = g.id and m.subscriber_id = s.id)
          )
      )
    )
$$;

create function count_broadcast_audience(filter jsonb) returns bigint
language sql stable set search_path = public as $$
  select count(*) from broadcast_audience(filter)
$$;

-- Broadcasts: an optional image for the trip layout, and the failed state so a stopped
-- send can be seen and resumed.
alter table broadcasts
  add column image_url text,
  add column image_alt text,
  add column last_error text,
  add column updated_at timestamptz not null default now();

alter table broadcasts alter column audience_filter set default '{"statuses": [], "airtable_segments": [], "segment_ids": []}';

alter table broadcasts drop constraint broadcasts_state_check;
alter table broadcasts add constraint broadcasts_state_check
  check (state in ('draft', 'scheduled', 'sending', 'sent', 'cancelled', 'failed'));

create index sends_broadcast_unsent_idx on sends (broadcast_id, id) where sent_at is null;

-- A row per recipient, so a retry can never reach anyone twice. Run once, when a send starts.
create function queue_broadcast_sends(target uuid) returns bigint
language sql set search_path = public as $$
  with queued as (
    insert into sends (subscriber_id, broadcast_id, idempotency_key, subject)
    select a.id, b.id, 'broadcast:' || b.id || ':' || a.id, b.subject
    from broadcasts b, broadcast_audience(b.audience_filter) a
    where b.id = target
    on conflict (idempotency_key) do nothing
    returning 1
  )
  select count(*) from queued
$$;

revoke execute on function queue_broadcast_sends(uuid) from public, anon, authenticated;
grant execute on function queue_broadcast_sends(uuid) to service_role;
revoke execute on function
  jsonb_text_array(jsonb), subscriber_matches_rules(subscribers, jsonb), segment_subscribers(uuid),
  count_rule_matches(jsonb), broadcast_audience(jsonb), count_broadcast_audience(jsonb)
from public, anon;
grant execute on function
  jsonb_text_array(jsonb), subscriber_matches_rules(subscribers, jsonb), segment_subscribers(uuid),
  count_rule_matches(jsonb), broadcast_audience(jsonb), count_broadcast_audience(jsonb)
to authenticated, service_role;

insert into templates (name, layout_key, default_subject, default_preheader) values
  ('Letter', 'letter', null, null),
  ('Announcement', 'announcement', null, null),
  ('Trip spotlight', 'trip_spotlight', null, null);
