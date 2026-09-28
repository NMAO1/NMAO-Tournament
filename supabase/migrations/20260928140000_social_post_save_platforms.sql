-- social_post_save: persist `platforms` on the UPDATE path too (was insert-only),
-- so the Mission Control per-post platform picker can change a post's targets.
create or replace function public.social_post_save(p_id uuid, p_patch jsonb)
 returns social_posts language plpgsql security definer set search_path to 'public','nmao'
as $function$
declare r public.social_posts;
begin
  if not nmao.staff_can('social','full') then
    raise exception 'not authorized for social' using errcode = '42501';
  end if;
  if p_id is null then
    insert into public.social_posts
      (pillar, title, format, platforms, hook, caption, hashtags, media_note, shot_list, on_screen,
       media_url, cta_url, needs_consent, status, scheduled_at, sort_order)
    values (
      p_patch->>'pillar', p_patch->>'title', p_patch->>'format',
      coalesce((select array_agg(x) from jsonb_array_elements_text(p_patch->'platforms') x), '{}'),
      p_patch->>'hook', p_patch->>'caption', p_patch->>'hashtags', p_patch->>'media_note',
      p_patch->>'shot_list', p_patch->>'on_screen', p_patch->>'media_url', p_patch->>'cta_url',
      coalesce((p_patch->>'needs_consent')::boolean,
               (p_patch->>'pillar') in ('Student Wins','Transformation','School Spotlight')),
      coalesce(p_patch->>'status','pending'),
      case when p_patch ? 'scheduled_at' and length(coalesce(p_patch->>'scheduled_at','')) > 0
           then (p_patch->>'scheduled_at')::timestamptz else null end,
      coalesce((p_patch->>'sort_order')::int, 999)
    ) returning * into r;
    return r;
  end if;
  update public.social_posts set
    platforms         = case when p_patch ? 'platforms'
                             then coalesce((select array_agg(x) from jsonb_array_elements_text(p_patch->'platforms') x), platforms)
                             else platforms end,
    caption           = coalesce(p_patch->>'caption', caption),
    hook              = coalesce(p_patch->>'hook', hook),
    hashtags          = coalesce(p_patch->>'hashtags', hashtags),
    media_note        = coalesce(p_patch->>'media_note', media_note),
    media_url         = case when p_patch ? 'media_url' then nullif(p_patch->>'media_url','') else media_url end,
    cta_url           = case when p_patch ? 'cta_url' then nullif(p_patch->>'cta_url','') else cta_url end,
    consent_confirmed = coalesce((p_patch->>'consent_confirmed')::boolean, consent_confirmed),
    needs_consent     = coalesce((p_patch->>'needs_consent')::boolean, needs_consent),
    status            = coalesce(p_patch->>'status', status),
    scheduled_at      = case when p_patch ? 'scheduled_at'
                             then nullif(p_patch->>'scheduled_at','')::timestamptz else scheduled_at end,
    updated_at        = now()
  where id = p_id
  returning * into r;
  return r;
end $function$;
