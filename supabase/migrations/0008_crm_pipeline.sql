-- The customer journey: a person is one row in subscribers, a trip is a departure or
-- custom safari, and a trip plan is one person or group pursuing one trip. Someone who
-- books twice has two trip plans and one history.

-- Travelers don't always have an email, such as a spouse on someone else's booking.
-- They simply can't receive email; see broadcast_audience below.
alter table subscribers alter column email drop not null;

create table trips (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'group' check (kind in ('group', 'custom')),
  starts_on date,
  ends_on date,
  seats int check (seats is null or seats > 0),
  price_per_person numeric(10, 2) check (price_per_person is null or price_per_person >= 0),
  deposit_per_person numeric(10, 2) check (deposit_per_person is null or deposit_per_person >= 0),
  balance_due_on date,
  notes text,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table trip_plans (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid references trips (id) on delete set null,
  stage text not null default 'talking' check (
    stage in ('talking', 'planning', 'proposal_sent', 'committed', 'ready', 'on_trip', 'traveled', 'not_this_time')
  ),
  owner text,
  next_step text,
  next_step_due date,
  itinerary_status text not null default 'not_started' check (
    itinerary_status in ('not_started', 'drafting', 'sent', 'approved')
  ),
  itinerary_url text,
  closed_reason text,
  agreed_total numeric(10, 2) check (agreed_total is null or agreed_total >= 0),
  deposit_amount numeric(10, 2) check (deposit_amount is null or deposit_amount >= 0),
  deposit_due_on date,
  balance_due_on date,
  prep_done text[] not null default '{}',
  last_changed_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index trip_plans_trip_idx on trip_plans (trip_id);
create index trip_plans_stage_idx on trip_plans (stage);

create table trip_plan_travelers (
  trip_plan_id uuid not null references trip_plans (id) on delete cascade,
  subscriber_id uuid not null references subscribers (id) on delete cascade,
  is_lead boolean not null default false,
  added_at timestamptz not null default now(),
  primary key (trip_plan_id, subscriber_id)
);

create index trip_plan_travelers_subscriber_idx on trip_plan_travelers (subscriber_id);

-- Entered by hand for now. Amounts are always positive; a refund's kind makes it count against.
create table payments (
  id uuid primary key default gen_random_uuid(),
  trip_plan_id uuid not null references trip_plans (id) on delete cascade,
  kind text not null check (kind in ('deposit', 'balance', 'other', 'refund')),
  amount numeric(10, 2) not null check (amount > 0),
  paid_on date not null,
  method text,
  note text,
  recorded_by text,
  created_at timestamptz not null default now()
);

create index payments_plan_idx on payments (trip_plan_id);

create table activities (
  id uuid primary key default gen_random_uuid(),
  subscriber_id uuid references subscribers (id) on delete cascade,
  trip_plan_id uuid references trip_plans (id) on delete cascade,
  kind text not null check (kind in ('note', 'call', 'email', 'meeting', 'plan', 'stage', 'itinerary', 'payment', 'prep')),
  body text,
  meta jsonb not null default '{}',
  author text,
  occurred_at timestamptz not null default now(),
  constraint activity_has_subject check (subscriber_id is not null or trip_plan_id is not null)
);

create index activities_subscriber_idx on activities (subscriber_id, occurred_at desc);
create index activities_plan_idx on activities (trip_plan_id, occurred_at desc);

do $$
declare
  t text;
begin
  foreach t in array array['trips', 'trip_plans', 'trip_plan_travelers', 'payments', 'activities'] loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy team_members_only on %I for all to authenticated using (is_team_member()) with check (is_team_member())',
      t
    );
  end loop;
end;
$$;

-- Changes log themselves, so the history can't be skipped by whichever screen made them.
create function log_trip_plan_change() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into activities (trip_plan_id, kind, meta, author)
    values (new.id, 'plan', jsonb_build_object('stage', new.stage), new.last_changed_by);
    return new;
  end if;
  if new.stage is distinct from old.stage then
    insert into activities (trip_plan_id, kind, meta, author)
    values (new.id, 'stage', jsonb_build_object('from', old.stage, 'to', new.stage), new.last_changed_by);
  end if;
  if new.itinerary_status is distinct from old.itinerary_status then
    insert into activities (trip_plan_id, kind, meta, author)
    values (new.id, 'itinerary', jsonb_build_object('from', old.itinerary_status, 'to', new.itinerary_status), new.last_changed_by);
  end if;
  return new;
end;
$$;

create trigger trip_plans_log_change after insert or update on trip_plans
  for each row execute function log_trip_plan_change();

create function log_payment_change() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into activities (trip_plan_id, kind, meta, author)
    values (
      new.trip_plan_id,
      'payment',
      jsonb_build_object('action', 'recorded', 'kind', new.kind, 'amount', new.amount, 'paid_on', new.paid_on),
      new.recorded_by
    );
    return new;
  end if;
  -- A deleted plan takes its payments with it, and there's nothing left to log against.
  -- recorded_by holds whoever removed it: the action stamps it just before deleting.
  if exists (select 1 from trip_plans where id = old.trip_plan_id) then
    insert into activities (trip_plan_id, kind, meta, author)
    values (
      old.trip_plan_id,
      'payment',
      jsonb_build_object('action', 'removed', 'kind', old.kind, 'amount', old.amount, 'paid_on', old.paid_on),
      old.recorded_by
    );
  end if;
  return old;
end;
$$;

create trigger payments_log_change after insert or delete on payments
  for each row execute function log_payment_change();

-- Where someone stands overall, worked out from their trip plans: the furthest any of them
-- has reached. A returning guest with a new inquiry stays a past guest. Correcting a
-- mistaken stage corrects this too, because nothing is stored separately to go stale.
create function plan_stage_rank(stage text) returns int
language sql immutable set search_path = public as $$
  select case
    when stage in ('talking', 'planning', 'proposal_sent') then 1
    when stage in ('committed', 'ready', 'on_trip') then 2
    when stage = 'traveled' then 3
    else 0
  end
$$;

create view contact_lifecycle with (security_invoker = true) as
  select
    s.id as subscriber_id,
    case coalesce(max(plan_stage_rank(p.stage)), 0)
      when 3 then 'past_guest'
      when 2 then 'customer'
      when 1 then 'prospect'
      else 'subscriber'
    end as lifecycle
  from subscribers s
  left join trip_plan_travelers t on t.subscriber_id = s.id
  left join trip_plans p on p.id = t.trip_plan_id
  group by s.id;

revoke all on contact_lifecycle from anon, public;
grant select on contact_lifecycle to authenticated, service_role;

-- Segments can now target by where someone is in their journey: their overall stage, the
-- stage of any trip plan, trips they joined, and trips they didn't.
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
      jsonb_text_array(rules -> 'not_on_trips') as not_on_trips
  )
  select
    (statuses || airtable_segments || trip_types || departure_windows || group_sizes
      || interests || objections || account_owners || keywords
      || lifecycles || plan_stages || trips || not_on_trips) <> '{}'
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

-- Adds two things: people without an email are left out, and a send can leave out saved
-- segments or overall stages, so committed guests don't get sales emails.
create or replace function broadcast_audience(filter jsonb) returns setof subscribers
language sql stable set search_path = public as $$
  select s.*
  from subscribers s
  where s.email is not null
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

revoke execute on function plan_stage_rank(text), log_trip_plan_change(), log_payment_change() from public, anon;
grant execute on function plan_stage_rank(text) to authenticated, service_role;

-- From tours/itineraries/2027-tanzania-beautiful.md. Deposit terms are left blank because
-- they aren't documented yet.
insert into trips (name, kind, starts_on, ends_on, seats, price_per_person, notes)
values (
  'Tanzania Beautiful', 'group', '2027-10-12', '2027-10-23', 12, 10900,
  'Couple rate is $9,900 per person.'
);
