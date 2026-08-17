-- Judge application intake: hold the raw application blob + when it was applied.
-- A judge starts life as status='pending' with background_check_status='not_started'
-- and no auth account; approval + setup-link + payouts come later in the flow.
alter table public.judges
  add column if not exists application jsonb,
  add column if not exists applied_at timestamptz;
