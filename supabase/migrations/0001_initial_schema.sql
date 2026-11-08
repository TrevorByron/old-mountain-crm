-- Subscriber CRM: full V1 schema from the handoff, plus Airtable sync columns.
-- Supabase holds the operational data. Airtable owns contact details, but the
-- opt-out columns (unsubscribed_at, suppressed) are only ever decided here.

create extension if not exists citext;

create table team_members (
  id uuid primary key default gen_random_uuid(),
  email citext not null unique,
  name text,
  invited_at timestamptz not null default now(),
  last_login_at timestamptz
);

-- Status values come from Airtable. They live in a lookup table so the team
-- can rename them without a migration; on update cascade carries renames over.
create table statuses (
  value text primary key,
  position int not null default 0
);

insert into statuses (value, position) values
  ('New', 1),
  ('Connected With', 2),
  ('Emailed', 3),
  ('Pre-payment', 4),
  ('Paid', 5);

create table subscribers (
  id uuid primary key default gen_random_uuid(),
  email citext not null unique,
  first_name text,
  last_name text,
  status text references statuses (value) on update cascade,
  source text,
  country text,
  segments text[] not null default '{}',
  subscribed_at timestamptz not null default now(),
  unsubscribed_at timestamptz,
  suppressed boolean not null default false,
  suppressed_reason text check (suppressed_reason in ('hard_bounce', 'complaint', 'manual')),
  airtable_record_id text unique,
  airtable_push_pending boolean not null default false,
  last_changed_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint suppressed_needs_reason check (not suppressed or suppressed_reason is not null)
);

create index subscribers_status_idx on subscribers (status);
create index subscribers_push_pending_idx on subscribers (airtable_push_pending) where airtable_push_pending;

create table subscriber_status_history (
  id uuid primary key default gen_random_uuid(),
  subscriber_id uuid not null references subscribers (id) on delete cascade,
  from_status text,
  to_status text,
  changed_by text,
  changed_at timestamptz not null default now()
);

create index subscriber_status_history_subscriber_idx on subscriber_status_history (subscriber_id, changed_at desc);

create table templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  layout_key text not null,
  default_subject text,
  default_preheader text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table broadcasts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  template_id uuid references templates (id),
  subject text,
  preheader text,
  heading text,
  body_markdown text,
  cta_label text,
  cta_url text,
  audience_filter jsonb not null default '{"statuses": []}',
  scheduled_at timestamptz,
  state text not null default 'draft' check (state in ('draft', 'scheduled', 'sending', 'sent', 'cancelled')),
  created_by uuid references team_members (id),
  sent_at timestamptz
);

create table journeys (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  trigger_status text references statuses (value) on update cascade,
  active boolean not null default false,
  exit_on_status_change boolean not null default true,
  allow_reentry boolean not null default false
);

create table journey_steps (
  id uuid primary key default gen_random_uuid(),
  journey_id uuid not null references journeys (id) on delete cascade,
  position int not null,
  type text not null check (type in ('send', 'wait', 'branch')),
  config jsonb not null default '{}',
  unique (journey_id, position)
);

create table journey_enrollments (
  id uuid primary key default gen_random_uuid(),
  journey_id uuid not null references journeys (id) on delete cascade,
  subscriber_id uuid not null references subscribers (id) on delete cascade,
  current_step_id uuid references journey_steps (id) on delete set null,
  state text not null default 'active' check (state in ('active', 'completed', 'exited')),
  exit_reason text,
  enrolled_at timestamptz not null default now(),
  completed_at timestamptz
);

create table sends (
  id uuid primary key default gen_random_uuid(),
  subscriber_id uuid not null references subscribers (id) on delete cascade,
  broadcast_id uuid references broadcasts (id),
  journey_step_id uuid references journey_steps (id) on delete set null,
  enrollment_id uuid references journey_enrollments (id) on delete set null,
  resend_message_id text,
  idempotency_key text not null unique,
  subject text,
  sent_at timestamptz
);

create table email_events (
  id uuid primary key default gen_random_uuid(),
  send_id uuid not null references sends (id) on delete cascade,
  provider_event_id text unique,
  type text not null check (type in ('delivered', 'opened', 'clicked', 'bounced', 'complained', 'unsubscribed')),
  link_url text,
  occurred_at timestamptz not null,
  raw jsonb,
  is_probable_bot boolean not null default false
);

create table sync_runs (
  id uuid primary key default gen_random_uuid(),
  trigger text not null check (trigger in ('first_import', 'manual', 'schedule')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_count int,
  updated_count int,
  skipped jsonb,
  error text
);

create table rate_limits (
  key text primary key,
  window_started_at timestamptz not null default now(),
  count int not null default 0
);

-- Every status change writes history, whichever code path made it.
create function record_status_change() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into subscriber_status_history (subscriber_id, from_status, to_status, changed_by)
    values (new.id, case when tg_op = 'UPDATE' then old.status end, new.status, new.last_changed_by);
  end if;
  return new;
end;
$$;

create trigger subscribers_record_status_change
  after insert or update of status on subscribers
  for each row execute function record_status_change();

-- An opt-out can't be undone by any sync, form or edit. Reversing one is a
-- deliberate database operation: run it with `set local app.allow_resubscribe = 'on'`.
create function protect_opt_out() returns trigger
language plpgsql as $$
begin
  if coalesce(current_setting('app.allow_resubscribe', true), '') <> 'on' then
    if old.unsubscribed_at is not null and new.unsubscribed_at is distinct from old.unsubscribed_at then
      raise exception 'unsubscribed_at cannot be changed once set' using errcode = 'P0001';
    end if;
    if old.suppressed and not new.suppressed then
      raise exception 'suppressed cannot be cleared' using errcode = 'P0001';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger subscribers_protect_opt_out
  before update on subscribers
  for each row execute function protect_opt_out();

-- Fixed-window limiter for the public signup endpoint. Returns true if allowed.
create function check_rate_limit(limit_key text, max_requests int, window_seconds int) returns boolean
language plpgsql as $$
declare
  current_count int;
begin
  insert into rate_limits as r (key, window_started_at, count)
  values (limit_key, now(), 1)
  on conflict (key) do update set
    count = case when r.window_started_at < now() - make_interval(secs => window_seconds) then 1 else r.count + 1 end,
    window_started_at = case when r.window_started_at < now() - make_interval(secs => window_seconds) then now() else r.window_started_at end
  returning count into current_count;
  return current_count <= max_requests;
end;
$$;

-- Row-level security: only signed-in team members can read or write. Public
-- endpoints (signup, unsubscribe, webhooks) use the service role on the server.
create function is_team_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.team_members
    where email = (auth.jwt() ->> 'email')::citext
  );
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'team_members', 'statuses', 'subscribers', 'subscriber_status_history',
    'templates', 'broadcasts', 'journeys', 'journey_steps', 'journey_enrollments',
    'sends', 'email_events', 'sync_runs'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy team_members_only on %I for all to authenticated using (is_team_member()) with check (is_team_member())',
      t
    );
  end loop;
end;
$$;

-- No policies: reachable only with the service role.
alter table rate_limits enable row level security;
revoke execute on function check_rate_limit(text, int, int) from public, anon, authenticated;
