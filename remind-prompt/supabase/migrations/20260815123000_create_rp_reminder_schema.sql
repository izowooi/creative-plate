create table if not exists public.rp_reminders (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 160),
  prompt_text text not null check (char_length(prompt_text) between 1 and 30000),
  destination_label text not null check (char_length(destination_label) between 1 and 500),
  destination_url text,
  project text,
  notes text,
  source_label text,
  source_ref text,
  timezone text not null default 'Asia/Seoul',
  due_at timestamptz not null,
  due_local timestamp without time zone not null,
  schedule_expression text not null,
  status text not null default 'open'
    check (status in ('open', 'acknowledged', 'completed', 'cancelled')),
  occurrence_version integer not null default 1 check (occurrence_version > 0),
  notification_sequence integer not null default 1 check (notification_sequence > 0),
  next_notification_at timestamptz,
  last_notified_at timestamptz,
  notification_count integer not null default 0 check (notification_count >= 0),
  consecutive_failures integer not null default 0 check (consecutive_failures >= 0),
  last_notification_error text,
  claim_token uuid,
  claimed_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz
);

comment on table public.rp_reminders is
  'Remind Prompt lifecycle state. Access only from a trusted server; prompt_text may be sensitive.';

create index if not exists rp_reminders_due_idx
  on public.rp_reminders (status, next_notification_at, claimed_until);
create index if not exists rp_reminders_display_idx
  on public.rp_reminders (status, due_at);

create table if not exists public.rp_deliveries (
  id uuid primary key default gen_random_uuid(),
  reminder_id uuid not null references public.rp_reminders(id) on delete cascade,
  occurrence_version integer not null check (occurrence_version > 0),
  sequence integer not null check (sequence > 0),
  channel text not null default 'slack',
  status text not null
    check (status in ('pending', 'in_flight', 'sent', 'failed', 'waiting_config', 'suppressed')),
  scheduled_for timestamptz not null,
  first_attempted_at timestamptz not null,
  last_attempted_at timestamptz not null,
  sent_at timestamptz,
  attempt_count integer not null default 1 check (attempt_count > 0),
  http_status integer,
  last_error text,
  lease_token uuid,
  unique (reminder_id, occurrence_version, sequence, channel)
);

comment on table public.rp_deliveries is
  'Durable notification outbox with one logical Slack delivery per reminder occurrence and sequence.';

create index if not exists rp_deliveries_reminder_idx
  on public.rp_deliveries (reminder_id, last_attempted_at desc);
create index if not exists rp_deliveries_status_idx
  on public.rp_deliveries (status, last_attempted_at);

create table if not exists public.rp_reminder_events (
  id uuid primary key default gen_random_uuid(),
  reminder_id uuid not null references public.rp_reminders(id) on delete cascade,
  event_type text not null,
  occurrence_version integer not null check (occurrence_version > 0),
  created_at timestamptz not null default now(),
  details jsonb not null default '{}'::jsonb
);

comment on table public.rp_reminder_events is
  'Prompt-free lifecycle and notification audit events for Remind Prompt.';

create index if not exists rp_reminder_events_reminder_idx
  on public.rp_reminder_events (reminder_id, created_at desc);

create table if not exists public.rp_worker_state (
  singleton boolean primary key default true check (singleton),
  heartbeat_at timestamptz,
  last_scan_at timestamptz,
  last_success_at timestamptz,
  last_error text
);

comment on table public.rp_worker_state is
  'Singleton worker heartbeat and latest scan health for Remind Prompt.';

alter table public.rp_reminders enable row level security;
alter table public.rp_deliveries enable row level security;
alter table public.rp_reminder_events enable row level security;
alter table public.rp_worker_state enable row level security;
