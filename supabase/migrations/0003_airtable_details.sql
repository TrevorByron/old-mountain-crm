-- The rest of the Airtable columns, mostly answers from the site's form. Airtable
-- owns these and the app only reads them. The opt-out checkbox is deliberately not
-- among them: opt-outs are decided here and only ever pushed out.

alter table subscribers
  add column phone text,
  add column account_owner text,
  add column trip_type text,
  add column departure_window text,
  add column group_size text,
  add column interests text[] not null default '{}',
  add column interests_other text,
  add column objections text[] not null default '{}',
  add column objections_other text;
