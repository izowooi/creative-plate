-- Isolated app storage. All existing public objects are left untouched.
create table public.enneagram_sessions (
  identity_hash text primary key check (identity_hash ~ '^[a-f0-9]{64}$'),
  answers jsonb not null default '{}'::jsonb,
  revision integer not null check (revision > 0),
  updated_at timestamptz not null default now()
);

create table public.enneagram_profiles (
  key text primary key check (key ~ '^[1-9](w[1-9])?$'),
  content jsonb not null,
  version integer not null default 1
);

create table public.enneagram_shares (
  id uuid primary key default gen_random_uuid(),
  scores jsonb not null,
  primary_type integer check (primary_type between 1 and 9),
  wing integer check (wing between 1 and 9),
  profile_key text references public.enneagram_profiles(key),
  created_at timestamptz not null default now()
);

create table public.enneagram_rate_buckets (
  key_hash text primary key,
  bucket timestamptz not null,
  hits integer not null
);

alter table public.enneagram_sessions enable row level security;
alter table public.enneagram_profiles enable row level security;
alter table public.enneagram_shares enable row level security;
alter table public.enneagram_rate_buckets enable row level security;
revoke all on public.enneagram_sessions, public.enneagram_profiles, public.enneagram_shares, public.enneagram_rate_buckets from anon, authenticated;

create function public.enneagram_rate_check(p_key text, p_limit integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_hits integer; v_bucket timestamptz := date_trunc('minute', now());
begin
  insert into public.enneagram_rate_buckets as b (key_hash,bucket,hits) values (p_key,v_bucket,1)
  on conflict (key_hash) do update set bucket = excluded.bucket, hits = case when b.bucket = excluded.bucket then b.hits + 1 else 1 end
  returning hits into v_hits;
  -- Bound stale limiter storage without scanning or deleting user sessions.
  delete from public.enneagram_rate_buckets where key_hash in
    (select key_hash from public.enneagram_rate_buckets where bucket < now() - interval '2 days' limit 50);
  return v_hits <= p_limit;
end $$;
revoke all on function public.enneagram_rate_check(text,integer) from public, anon, authenticated;

create function public.enneagram_valid_answers(p_answers jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(p_answers) = 'object' then
    (select count(*) <= 54 and coalesce(bool_and(key ~ '^q([1-9]|[1-4][0-9]|5[0-4])$' and jsonb_typeof(value) = 'number' and value::text ~ '^[1-5]$'),true) from jsonb_each(p_answers))
  else false end
$$;
revoke all on function public.enneagram_valid_answers(jsonb) from public, anon, authenticated;

create function public.enneagram_session_load(p_identity_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_session jsonb;
begin
  if p_identity_hash is null or p_identity_hash !~ '^[a-f0-9]{64}$' then return '{"error":"invalid_input"}'::jsonb; end if;
  if not public.enneagram_rate_check('session:'||p_identity_hash,60) then return '{"error":"rate_limit"}'::jsonb; end if;
  select jsonb_build_object('answers', answers, 'revision', revision, 'updatedAt', updated_at) into v_session from public.enneagram_sessions where identity_hash = p_identity_hash;
  return jsonb_build_object('session', v_session);
end $$;

create function public.enneagram_session_save(p_identity_hash text,p_answers jsonb,p_revision integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_saved jsonb; v_session jsonb;
begin
  if p_identity_hash is null or p_identity_hash !~ '^[a-f0-9]{64}$' or not coalesce(public.enneagram_valid_answers(p_answers),false) or p_revision is null or p_revision < 0 or p_revision > 2147483646 then return '{"error":"invalid_input"}'::jsonb; end if;
  if not public.enneagram_rate_check('session:'||p_identity_hash,60) then return '{"error":"rate_limit"}'::jsonb; end if;
  if p_revision = 0 then
    insert into public.enneagram_sessions (identity_hash,answers,revision) values (p_identity_hash,p_answers,1) on conflict (identity_hash) do nothing
    returning jsonb_build_object('revision',revision,'updatedAt',updated_at) into v_saved;
  else
    update public.enneagram_sessions set answers = p_answers, revision = revision + 1, updated_at = now() where identity_hash = p_identity_hash and revision = p_revision
    returning jsonb_build_object('revision',revision,'updatedAt',updated_at) into v_saved;
  end if;
  if v_saved is not null then return v_saved; end if;
  select jsonb_build_object('answers',answers,'revision',revision,'updatedAt',updated_at) into v_session from public.enneagram_sessions where identity_hash = p_identity_hash;
  return jsonb_build_object('error','conflict','session',v_session);
end $$;

create function public.enneagram_session_delete(p_identity_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if p_identity_hash is null or p_identity_hash !~ '^[a-f0-9]{64}$' then return '{"error":"invalid_input"}'::jsonb; end if;
  if not public.enneagram_rate_check('session:'||p_identity_hash,60) then return '{"error":"rate_limit"}'::jsonb; end if;
  delete from public.enneagram_sessions where identity_hash = p_identity_hash;
  return '{"deleted":true}'::jsonb;
end $$;

create function public.enneagram_share_create(p_scores jsonb,p_primary integer,p_wing integer,p_profile_key text,p_client_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_max numeric; v_distinct integer; v_previous integer; v_next integer;
begin
  if p_client_hash is null or p_client_hash !~ '^[a-f0-9]{64}$' or jsonb_typeof(p_scores) is distinct from 'array' then return '{"error":"invalid_input"}'::jsonb; end if;
  if jsonb_array_length(p_scores) <> 9 or exists (select 1 from jsonb_array_elements(p_scores) as s where jsonb_typeof(s) <> 'number') then return '{"error":"invalid_input"}'::jsonb; end if;
  if exists (select 1 from jsonb_array_elements_text(p_scores) as s where s::numeric < 0 or s::numeric > 100) then return '{"error":"invalid_input"}'::jsonb; end if;
  select max(s::numeric),count(distinct s::numeric) into v_max,v_distinct from jsonb_array_elements_text(p_scores) as s;
  if p_primary is null then
    if v_distinct <> 1 or p_wing is not null or p_profile_key is not null then return '{"error":"invalid_input"}'::jsonb; end if;
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

create function public.enneagram_share_get(p_id uuid)
returns jsonb language sql security definer set search_path = '' as $$
  select jsonb_build_object('scores',scores,'primary',primary_type,'wing',wing,'profileKey',profile_key,'createdAt',created_at) from public.enneagram_shares where id = p_id
$$;

create function public.enneagram_profiles_get()
returns jsonb language sql security definer set search_path = '' as $$
  select coalesce(jsonb_agg(content order by key),'[]'::jsonb) from public.enneagram_profiles
$$;

revoke all on function public.enneagram_session_load(text), public.enneagram_session_save(text,jsonb,integer), public.enneagram_session_delete(text), public.enneagram_share_create(jsonb,integer,integer,text,text), public.enneagram_share_get(uuid), public.enneagram_profiles_get() from public;
grant execute on function public.enneagram_session_load(text), public.enneagram_session_save(text,jsonb,integer), public.enneagram_session_delete(text), public.enneagram_share_create(jsonb,integer,integer,text,text), public.enneagram_share_get(uuid), public.enneagram_profiles_get() to anon, authenticated;
