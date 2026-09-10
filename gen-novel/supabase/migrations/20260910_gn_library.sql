-- Dedicated gn_ tables; existing application tables are not modified.
create table public.gn_books (
  id text primary key check (id ~ '^[a-z0-9-]+$'),
  title text not null,
  author text not null,
  genre text not null,
  tags jsonb not null default '[]' check (jsonb_typeof(tags) = 'array'),
  description text not null default '',
  quote text not null default '',
  published boolean not null default true,
  updated_at timestamptz not null default now()
);
create table public.gn_episodes (
  book_id text not null references public.gn_books(id),
  id text not null check (id ~ '^ep-[0-9]+$'),
  number integer not null check (number > 0),
  title text not null,
  status text not null check (status in ('draft','final')),
  body text not null check (length(trim(body)) > 0),
  characters integer not null check (characters >= 0),
  minutes integer not null check (minutes > 0),
  source_updated_at timestamptz not null,
  content_hash text not null,
  published boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (book_id, id),
  unique (book_id, number)
);
create table public.gn_episode_revisions (
  book_id text not null references public.gn_books(id),
  episode_id text not null,
  content_hash text not null,
  snapshot jsonb not null,
  source_commit text not null,
  created_at timestamptz not null default now(),
  primary key (book_id, episode_id, content_hash)
);
create table public.gn_sync_state (
  id text primary key check (id = 'github'),
  revision bigint not null default -1,
  source_commit text,
  synced_at timestamptz
);
insert into public.gn_sync_state (id) values ('github');
create table public.gn_sync_credentials (
  id text primary key check (id = 'github'),
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$')
);

alter table public.gn_books enable row level security;
alter table public.gn_episodes enable row level security;
alter table public.gn_episode_revisions enable row level security;
alter table public.gn_sync_state enable row level security;
alter table public.gn_sync_credentials enable row level security;
revoke all on public.gn_books, public.gn_episodes, public.gn_episode_revisions,
  public.gn_sync_state, public.gn_sync_credentials from anon, authenticated;
grant select on public.gn_books, public.gn_episodes to anon, authenticated;
create policy gn_books_public_read on public.gn_books for select to anon, authenticated using (published);
create policy gn_episodes_public_read on public.gn_episodes for select to anon, authenticated
  using (published and exists(select 1 from public.gn_books b where b.id = book_id and b.published));

-- Atomic, narrowly scoped import. The CI credential grants no access to other tables.
create function public.gn_import_catalog(p_payload jsonb, p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  b jsonb; e jsonb; v_hash text; v_revision bigint; v_count integer := 0;
  v_previous bigint; v_commit text;
begin
  if p_token is null or length(p_token) < 40 or not exists (
    select 1 from public.gn_sync_credentials
    where id = 'github' and token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
  ) then raise exception 'gn import unauthorized' using errcode = '42501'; end if;
  if jsonb_typeof(p_payload->'books') is distinct from 'array' then
    raise exception 'books must be an array';
  end if;
  v_revision := (p_payload->>'revision')::bigint;
  v_commit := p_payload->>'commit';
  if v_revision is null or v_revision < 1 or v_commit is null or v_commit !~ '^[0-9a-f]{40}$' then
    raise exception 'invalid provenance';
  end if;
  select revision into v_previous from public.gn_sync_state where id='github' for update;
  if v_revision <= v_previous then
    return jsonb_build_object('status','already_applied','revision',v_previous);
  end if;
  for b in select value from jsonb_array_elements(p_payload->'books') loop
    if jsonb_typeof(b->'episodes') is distinct from 'array' then raise exception 'episodes must be an array'; end if;
    insert into public.gn_books (id,title,author,genre,tags,description,quote,published)
      values (b->>'id',b->>'title',b->>'author',b->>'genre',b->'tags',b->>'description',b->>'quote',true)
      on conflict(id) do update set title=excluded.title,author=excluded.author,genre=excluded.genre,
        tags=excluded.tags,description=excluded.description,quote=excluded.quote,published=true,updated_at=now();
    for e in select value from jsonb_array_elements(b->'episodes') loop
      v_hash := encode(sha256(convert_to(e::text, 'UTF8')), 'hex');
      insert into public.gn_episode_revisions (book_id,episode_id,content_hash,snapshot,source_commit)
        values (b->>'id',e->>'id',v_hash,e,v_commit) on conflict do nothing;
      insert into public.gn_episodes (book_id,id,number,title,status,body,characters,minutes,source_updated_at,content_hash,published)
        values (b->>'id',e->>'id',(e->>'number')::integer,e->>'title',e->>'status',e->>'body',
          (e->>'characters')::integer,(e->>'minutes')::integer,(e->>'updatedAt')::timestamptz,v_hash,true)
        on conflict(book_id,id) do update set number=excluded.number,title=excluded.title,status=excluded.status,
          body=excluded.body,characters=excluded.characters,minutes=excluded.minutes,
          source_updated_at=excluded.source_updated_at,content_hash=excluded.content_hash,published=true,updated_at=now()
        where public.gn_episodes.status <> 'final' or excluded.status = 'final';
      v_count := v_count + 1;
    end loop;
    -- Remove from the reader, not from history, if a chapter is intentionally excluded from the catalog.
    update public.gn_episodes set published=false,updated_at=now()
      where book_id=b->>'id' and published and id not in
        (select value->>'id' from jsonb_array_elements(b->'episodes'));
  end loop;
  update public.gn_books set published=false,updated_at=now() where published and id not in
    (select value->>'id' from jsonb_array_elements(p_payload->'books'));
  update public.gn_sync_state set revision=v_revision,source_commit=v_commit,synced_at=now() where id='github';
  return jsonb_build_object('status','applied','books',jsonb_array_length(p_payload->'books'),'episodes',v_count,'revision',v_revision);
end;
$$;
revoke all on function public.gn_import_catalog(jsonb,text) from public;
grant execute on function public.gn_import_catalog(jsonb,text) to anon;
