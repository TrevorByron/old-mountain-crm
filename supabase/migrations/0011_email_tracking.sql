-- Webhooks find a send by Resend's message id, and results read a send's events.
create unique index sends_resend_message_id_idx on sends (resend_message_id) where resend_message_id is not null;
create index email_events_send_id_idx on email_events (send_id);

-- Counts people, not events: someone who opens five times is one open, and a click means they opened.
-- Likely bot activity is left out. Runs as the caller, so row-level security still applies.
create function campaign_engagement()
returns table (broadcast_id uuid, delivered bigint, opened bigint, clicked bigint, bounced bigint, complained bigint)
language sql stable as $$
  select
    s.broadcast_id,
    count(distinct s.id) filter (where e.type = 'delivered'),
    count(distinct s.id) filter (where e.type in ('opened', 'clicked') and not e.is_probable_bot),
    count(distinct s.id) filter (where e.type = 'clicked' and not e.is_probable_bot),
    count(distinct s.id) filter (where e.type = 'bounced'),
    count(distinct s.id) filter (where e.type = 'complained')
  from sends s
  join email_events e on e.send_id = s.id
  where s.broadcast_id is not null
  group by s.broadcast_id
$$;

revoke execute on function campaign_engagement() from public, anon;
grant execute on function campaign_engagement() to authenticated, service_role;
