-- FR-SEC-01: daily_llm_cost (0001) runs as its owner and was readable by every signed-in student,
-- showing app-wide AI calls, tokens and costs. Nothing in the app or API reads it; the admin app
-- will use the service role. Same treatment as llm_daily_costs (0010).
revoke all on daily_llm_cost from anon, authenticated, public;
alter view daily_llm_cost set (security_invoker = true);
