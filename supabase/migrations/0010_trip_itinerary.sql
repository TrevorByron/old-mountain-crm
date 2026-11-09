-- The day-by-day plan for a trip. Each day is its own row, so saving one field can't overwrite another.
create table trip_itinerary_days (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips (id) on delete cascade,
  position integer not null,
  label text not null default '',
  title text not null default '',
  description text not null default '',
  stay text not null default '',
  created_at timestamptz not null default now()
);

create index trip_itinerary_days_trip_position on trip_itinerary_days (trip_id, position);

alter table trip_itinerary_days enable row level security;
create policy team_members_only on trip_itinerary_days for all to authenticated using (is_team_member()) with check (is_team_member());
