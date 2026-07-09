-- Redesign copy: punchier global GREEN player-flag message (the "why" sub-line
-- under the "Today's decision" headline), matching the Claude Design mockup.
-- The headline itself comes from flagUi() in code; this updates the DB default
-- sub-message. Global rows only (team_id is null) — no team override is touched.

update player_flag_messages
set message = 'Readiness is green across the board. Follow the plan, warm up well, and put quality first.'
where flag = 'GREEN' and team_id is null and lang = 'en' and is_active = true;

update player_flag_messages
set message = 'Reiðuskori er grænt á öllum sviðum. Fylgdu planinu, hitaðu vel upp og settu gæði í forgang.'
where flag = 'GREEN' and team_id is null and lang = 'is' and is_active = true;
