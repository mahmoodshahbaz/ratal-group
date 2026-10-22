-- ============================================================
--  PO Requests table + RLS  (run in Supabase SQL editor)
-- ============================================================

create table if not exists po_requests (
  id                   uuid primary key default gen_random_uuid(),
  request_number       text,
  request_date         date not null default current_date,
  employee_id          uuid references employees(id),
  department           text,
  contact_number       text,
  project_id           uuid references projects(id),
  site_no              text,
  preferred_party_id   uuid references contractors(id),
  preferred_party_name text,
  urgency              text not null default 'NORMAL' check (urgency in ('NORMAL','URGENT','ASAP')),
  needed_by            date,
  justification        text,
  items                jsonb,
  estimated_total      numeric(14,2) default 0,
  status               text not null default 'SUBMITTED'
                         check (status in ('SUBMITTED','REVIEWED','APPROVED','REJECTED','ORDERED','RECEIVED','CLOSED')),
  approved_by          uuid references employees(id),
  approved_at          timestamptz,
  notes                text,
  created_at           timestamptz default now(),
  updated_at           timestamptz default now()
);

-- Auto-number trigger
create sequence if not exists po_request_seq start 1;

create or replace function set_po_request_number()
returns trigger language plpgsql as $$
begin
  new.request_number := 'POR-' || to_char(now(), 'YYYYMM') || '-'
                        || lpad(nextval('po_request_seq')::text, 4, '0');
  return new;
end;
$$;

drop trigger if exists trg_po_request_number on po_requests;
create trigger trg_po_request_number
  before insert on po_requests
  for each row execute function set_po_request_number();

-- Updated_at trigger
create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_po_requests_updated_at on po_requests;
create trigger trg_po_requests_updated_at
  before update on po_requests
  for each row execute function touch_updated_at();

-- RLS
alter table po_requests enable row level security;

drop policy if exists "po_requests_all" on po_requests;
create policy "po_requests_all" on po_requests
  for all to authenticated using (true) with check (true);
