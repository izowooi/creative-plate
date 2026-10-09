create or replace function public.enneagram_share_create(p_scores jsonb,p_primary integer,p_wing integer,p_profile_key text,p_client_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_max numeric; v_distinct integer; v_previous integer; v_next integer;
begin
  if p_client_hash is null or p_client_hash !~ '^[a-f0-9]{64}$' or jsonb_typeof(p_scores) is distinct from 'array' then return '{"error":"invalid_input"}'::jsonb; end if;
  if jsonb_array_length(p_scores) <> 9 or exists (select 1 from jsonb_array_elements(p_scores) as s where jsonb_typeof(s) <> 'number') then return '{"error":"invalid_input"}'::jsonb; end if;
  if exists (select 1 from jsonb_array_elements_text(p_scores) as s where s::numeric < 0 or s::numeric > 100) then return '{"error":"invalid_input"}'::jsonb; end if;
  select max(s::numeric),count(distinct s::numeric) into v_max,v_distinct from jsonb_array_elements_text(p_scores) as s;
  if p_primary is null then
    if v_max - (select min(s::numeric) from jsonb_array_elements_text(p_scores) as s) > 4.200000001 or p_wing is not null or p_profile_key is not null then return '{"error":"invalid_input"}'::jsonb; end if;
  else
    if p_primary < 1 or p_primary > 9 or (p_scores ->> (p_primary - 1))::numeric <> v_max then return '{"error":"invalid_input"}'::jsonb; end if;
    v_previous := case when p_primary = 1 then 9 else p_primary - 1 end;
    v_next := case when p_primary = 9 then 1 else p_primary + 1 end;
    if p_wing is not null and p_wing <> v_previous and p_wing <> v_next then return '{"error":"invalid_input"}'::jsonb; end if;
    if p_profile_key is distinct from (p_primary::text || case when p_wing is null then '' else 'w'||p_wing::text end) then return '{"error":"invalid_input"}'::jsonb; end if;
    if not exists (select 1 from public.enneagram_profiles where key = p_profile_key) then return '{"error":"invalid_input"}'::jsonb; end if;
  end if;
  if not public.enneagram_rate_check('share:'||p_client_hash,12) then return '{"error":"rate_limit"}'::jsonb; end if;
  insert into public.enneagram_shares (scores,primary_type,wing,profile_key) values (p_scores,p_primary,p_wing,p_profile_key) returning id into v_id;
  return jsonb_build_object('id',v_id);
end $$;
