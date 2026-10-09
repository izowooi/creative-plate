-- namu web app (접두어 nw_): 나무위키 수집 결과 캐시와 수집 작업 대기열.
--
-- 접근 통제: 세 테이블 모두 RLS 로 잠그고, 요청 헤더 x-nw-token 의 SHA-256 이 아래 해시와 같을 때만 anon 에게 허용한다.
-- 토큰 원문은 어디에도 저장하지 않는다. 교체하려면 nw_token_ok() 의 해시와 Pages 환경변수 NW_TOKEN_SHA256 을 함께 바꾼다.
-- 이 프로젝트의 다른 앱 테이블(pd_*, gn_*, rp_* 등)에는 접근하지 않는다.

create or replace function public.nw_token_ok()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(
    encode(
      sha256(convert_to(coalesce(nullif(current_setting('request.headers', true), '')::json ->> 'x-nw-token', ''), 'utf8')),
      'hex'
    ) = '2328815f1ac467cf6346139afb9e060e6fda0865948b67b2e00332c7d27fdf10',
    false
  )
$$;
comment on function public.nw_token_ok() is 'namu web app: x-nw-token 헤더의 SHA-256 이 등록된 해시와 같은지 검사한다. nw_* 테이블 RLS 정책에서만 쓴다.';

-- 수집한 문서 원문(HTML). 응답 원문을 저장하고 추출은 읽을 때 한다.
create table public.nw_pages (
  key text primary key,
  title text not null unique,
  status smallint not null,
  final_url text,
  via text not null,
  note text not null default '',
  html text not null default '',
  fetched_at timestamptz not null default now(),
  size_bytes integer generated always as (octet_length(html)) stored
);
comment on table public.nw_pages is 'namu web app: 수집한 나무위키 문서 원문 캐시. key=문서명 SHA-1 앞 16자, status 는 원본 HTTP 상태(200/404).';
create index nw_pages_fetched_at_idx on public.nw_pages (fetched_at desc);

-- 스킨 CSS 와 폰트(base64). 문서와 같은 시점의 CSS 를 보관해야 해시가 바뀐 뒤에도 옛 문서 모양이 유지된다.
create table public.nw_assets (
  key text primary key,
  kind text not null check (kind in ('css', 'font')),
  body text not null,
  fetched_at timestamptz not null default now()
);
comment on table public.nw_assets is 'namu web app: 나무위키 스킨 CSS 원문(kind=css)과 폰트 base64(kind=font) 캐시.';

-- 수집 작업 대기열. 확장 프로그램을 쓸 수 없는 기기에서 등록하면 집 컴퓨터 워커가 처리한다.
create table public.nw_jobs (
  id bigint generated always as identity primary key,
  title text not null,
  status text not null default 'pending' check (status in ('pending', 'running', 'done', 'not_found', 'error')),
  agent text,
  error text,
  attempts integer not null default 0,
  requested_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);
comment on table public.nw_jobs is 'namu web app: 수집 작업 대기열. 같은 문서의 진행 중(pending/running) 작업은 하나만 허용한다.';
create unique index nw_jobs_open_title_idx on public.nw_jobs (title) where status in ('pending', 'running');
create index nw_jobs_status_requested_idx on public.nw_jobs (status, requested_at);

alter table public.nw_pages enable row level security;
alter table public.nw_assets enable row level security;
alter table public.nw_jobs enable row level security;

create policy nw_pages_token on public.nw_pages for all to anon using (public.nw_token_ok()) with check (public.nw_token_ok());
create policy nw_assets_token on public.nw_assets for all to anon using (public.nw_token_ok()) with check (public.nw_token_ok());
create policy nw_jobs_token on public.nw_jobs for all to anon using (public.nw_token_ok()) with check (public.nw_token_ok());

-- 로그인한 사용자(authenticated)용 접근은 쓰지 않으므로 권한도 거둔다.
revoke all on table public.nw_pages, public.nw_assets, public.nw_jobs from authenticated;
