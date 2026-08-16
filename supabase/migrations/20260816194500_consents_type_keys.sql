-- The competitor signup wizard collects three guardian consents keyed
-- media_release / rules / terms, but consents_type_check only allowed the
-- original coppa_media / participation_waiver — so consent rows were rejected
-- (and the EF was silently swallowing the error). Allow the wizard's keys
-- (keeping the originals for back-compat) so guardian consent is actually
-- recorded for minors.
alter table public.consents drop constraint if exists consents_type_check;
alter table public.consents add constraint consents_type_check
  check (type in ('coppa_media', 'participation_waiver', 'media_release', 'rules', 'terms'));
