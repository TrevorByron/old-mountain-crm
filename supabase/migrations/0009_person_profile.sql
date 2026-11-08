-- What the team knows about a person, beyond what they told a form: lasting notes, tags,
-- who sent them, and when to get back in touch.
alter table subscribers
  add column about text,
  add column tags text[] not null default '{}',
  add column referred_by text,
  add column follow_up_on date,
  add column follow_up_note text,
  -- Someone the team added by hand, like a traveler's spouse, hasn't asked for marketing email.
  add column marketing_ok boolean not null default true;

create index subscribers_follow_up_idx on subscribers (follow_up_on) where follow_up_on is not null;

-- When a person last heard from or spoke with the team. Logged conversations on their
-- own record or any trip plan they're on, and emails that actually went out.
create view contact_last_touch with (security_invoker = true) as
  select subscriber_id, max(touched_at) as last_touch
  from (
    select a.subscriber_id, a.occurred_at as touched_at
    from activities a
    where a.subscriber_id is not null and a.kind in ('note', 'call', 'email', 'meeting')
    union all
    select t.subscriber_id, a.occurred_at
    from activities a
    join trip_plan_travelers t on t.trip_plan_id = a.trip_plan_id
    where a.kind in ('note', 'call', 'email', 'meeting')
    union all
    select s.subscriber_id, s.sent_at
    from sends s
    where s.sent_at is not null
  ) touches
  group by subscriber_id;

revoke all on contact_last_touch from anon, public;
grant select on contact_last_touch to authenticated, service_role;

-- Tags are a new segment rule. The rest is unchanged from 0008.
create or replace function subscriber_matches_rules(s subscribers, rules jsonb) returns boolean
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
      jsonb_text_array(rules -> 'keywords') as keywords,
      jsonb_text_array(rules -> 'lifecycles') as lifecycles,
      jsonb_text_array(rules -> 'plan_stages') as plan_stages,
      jsonb_text_array(rules -> 'trips') as trips,
      jsonb_text_array(rules -> 'not_on_trips') as not_on_trips,
      jsonb_text_array(rules -> 'tags') as tags
  )
  select
    (statuses || airtable_segments || trip_types || departure_windows || group_sizes
      || interests || objections || account_owners || keywords
      || lifecycles || plan_stages || trips || not_on_trips || tags) <> '{}'
    and (statuses = '{}' or s.status = any (statuses))
    and (airtable_segments = '{}' or s.segments && airtable_segments)
    and (trip_types = '{}' or s.trip_type = any (trip_types))
    and (departure_windows = '{}' or s.departure_window = any (departure_windows))
    and (group_sizes = '{}' or s.group_size = any (group_sizes))
    and (interests = '{}' or s.interests && interests)
    and (objections = '{}' or s.objections && objections)
    and (account_owners = '{}' or s.account_owner = any (account_owners))
    and (tags = '{}' or s.tags && tags)
    and (keywords = '{}' or exists (
      select 1 from unnest(keywords) keyword
      where position(
        lower(keyword) in lower(concat_ws(' ', s.interests_other, s.objections_other, s.source, s.about))
      ) > 0
    ))
    and (lifecycles = '{}' or exists (
      select 1 from contact_lifecycle l where l.subscriber_id = s.id and l.lifecycle = any (lifecycles)
    ))
    and (plan_stages = '{}' or exists (
      select 1 from trip_plan_travelers t join trip_plans p on p.id = t.trip_plan_id
      where t.subscriber_id = s.id and p.stage = any (plan_stages)
    ))
    and (trips = '{}' or exists (
      select 1 from trip_plan_travelers t join trip_plans p on p.id = t.trip_plan_id
      where t.subscriber_id = s.id and p.trip_id::text = any (trips) and plan_stage_rank(p.stage) >= 2
    ))
    and (not_on_trips = '{}' or not exists (
      select 1 from trip_plan_travelers t join trip_plans p on p.id = t.trip_plan_id
      where t.subscriber_id = s.id and p.trip_id::text = any (not_on_trips) and plan_stage_rank(p.stage) >= 2
    ))
  from r
$$;

-- People who haven't agreed to marketing email are left out. Everything else is unchanged.
create or replace function broadcast_audience(filter jsonb) returns setof subscribers
language sql stable set search_path = public as $$
  select s.*
  from subscribers s
  where s.email is not null
    and s.marketing_ok
    and s.unsubscribed_at is null
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
    and not exists (
      select 1 from segments g
      where g.id::text = any (jsonb_text_array(filter -> 'exclude_segment_ids'))
        and (
          subscriber_matches_rules(s, g.rules)
          or exists (select 1 from segment_members m where m.segment_id = g.id and m.subscriber_id = s.id)
        )
    )
    and not exists (
      select 1 from contact_lifecycle l
      where l.subscriber_id = s.id and l.lifecycle = any (jsonb_text_array(filter -> 'exclude_lifecycles'))
    )
$$;

-- Which saved segments someone is in, for their profile.
create function person_segments(target uuid) returns setof segments
language sql stable set search_path = public as $$
  select g.*
  from segments g, subscribers s
  where s.id = target
    and (
      subscriber_matches_rules(s, g.rules)
      or exists (select 1 from segment_members m where m.segment_id = g.id and m.subscriber_id = s.id)
    )
$$;

revoke execute on function person_segments(uuid) from public, anon;
grant execute on function person_segments(uuid) to authenticated, service_role;
