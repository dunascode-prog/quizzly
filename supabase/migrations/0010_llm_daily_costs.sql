-- FR-LIM-02: the admin cost view: AI calls, tokens and estimated cost per day, provider and
-- model (Africa/Lagos days). Service role only: students must never read it.
create view llm_daily_costs as
select (created_at at time zone 'Africa/Lagos')::date as day,
       provider,
       model,
       count(*) as calls,
       count(*) filter (where status <> 'ok') as failed_calls,
       sum(coalesce(prompt_tokens, 0) + coalesce(completion_tokens, 0)) as tokens,
       sum(cost_usd) as cost_usd
from llm_calls
group by 1, 2, 3;

revoke all on llm_daily_costs from anon, authenticated;
