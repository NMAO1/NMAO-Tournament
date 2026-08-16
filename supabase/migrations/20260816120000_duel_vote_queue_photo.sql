DROP FUNCTION IF EXISTS public.duel_vote_queue(uuid,integer,text);
CREATE OR REPLACE FUNCTION public.duel_vote_queue(p_competitor_id uuid, p_limit integer DEFAULT 20, p_search text DEFAULT NULL::text)
 RETURNS TABLE(duel_id uuid, duel_type text, closes_vote_at timestamp with time zone, vote_count bigint,
   challenger_id uuid, challenger_name text, challenger_school text, challenger_video text, challenger_photo text,
   challenger_frame_code text, challenger_frame_rarity text, challenger_frame_name text, challenger_frame_desc text,
   opponent_id uuid, opponent_name text, opponent_school text, opponent_video text, opponent_photo text,
   opponent_frame_code text, opponent_frame_rarity text, opponent_frame_name text, opponent_frame_desc text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select d.id, coalesce(et.name, d.type), d.closes_vote_at,
         (select count(*) from duel_votes v where v.duel_id = d.id) as vote_count,
         ch.id, (nmao.display_name(ch.first_name, ch.last_name)), chs.name, d.challenger_video, ch.profile_photo_url,
         ch.equipped_badge_code, chb.rarity::text, chb.name, chb.description,
         op.id, (nmao.display_name(op.first_name, op.last_name)), ops.name, d.opponent_video, op.profile_photo_url,
         op.equipped_badge_code, opb.rarity::text, opb.name, opb.description
  from duels d
  join competitors ch on ch.id = d.challenger_id
  join competitors op on op.id = d.opponent_id
  left join schools chs on chs.id = ch.school_id
  left join schools ops on ops.id = op.school_id
  left join badges  chb on chb.code = ch.equipped_badge_code
  left join badges  opb on opb.code = op.equipped_badge_code
  left join event_types et on et.code = d.type
  where d.status = 'voting' and d.moderation_status = 'ok'
    and d.challenger_id <> p_competitor_id and d.opponent_id <> p_competitor_id
    and not exists (select 1 from duel_votes v where v.duel_id = d.id and v.voter_competitor_id = p_competitor_id)
    and (p_search is null or btrim(p_search) = '' or
      (nmao.display_name(ch.first_name, ch.last_name)) ilike '%' || btrim(p_search) || '%' or
      (nmao.display_name(op.first_name, op.last_name)) ilike '%' || btrim(p_search) || '%' or
      chs.name ilike '%' || btrim(p_search) || '%' or ops.name ilike '%' || btrim(p_search) || '%')
  order by vote_count asc, d.closes_vote_at asc
  limit greatest(1, least(coalesce(p_limit, 20), 100));
$function$;

GRANT EXECUTE ON FUNCTION public.duel_vote_queue(uuid,integer,text) TO authenticated, anon;
