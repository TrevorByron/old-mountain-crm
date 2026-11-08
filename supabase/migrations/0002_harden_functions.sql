-- From Supabase's security advisor: pin search_path so these functions can't be
-- pointed at lookalike objects, and keep is_team_member away from anonymous callers.
-- Signed-in users keep execute on it because the row-level security policies call it.

alter function record_status_change() set search_path = public;
alter function protect_opt_out() set search_path = public;
alter function check_rate_limit(text, int, int) set search_path = public;

revoke execute on function is_team_member() from public, anon;
grant execute on function is_team_member() to authenticated;
