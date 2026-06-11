-- =========================================
-- UNITE WORK SCHEDULE - SUPABASE SETUP
-- Chạy trong Supabase SQL Editor
-- =========================================

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  employee_code text unique not null,
  full_name text not null,
  email text unique not null,
  phone text,
  role_type text not null check (role_type in ('TTS', 'NVPT', 'LEADER', 'ADMIN', 'SUPER_ADMIN')),
  team text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  min_days_per_month integer not null default 12,
  created_at timestamptz not null default now()
);

create table if not exists public.schedule_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  work_date date not null,
  shift text not null check (shift in ('morning', 'afternoon', 'full_day')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  note text,
  submitted_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz
);

create table if not exists public.unavailability (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  unavailable_date date not null,
  shift text not null check (shift in ('morning', 'afternoon', 'full_day')),
  reason_type text not null check (reason_type in ('school', 'personal', 'family', 'exam', 'other')),
  note text,
  status text not null default 'active' check (status in ('active', 'cancelled')),
  created_at timestamptz not null default now()
);

create table if not exists public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  schedule_request_id uuid references public.schedule_requests(id) on delete set null,
  leave_date date not null,
  shift text not null check (shift in ('morning', 'afternoon', 'full_day')),
  leave_type text not null check (leave_type in ('sick', 'personal', 'school', 'family', 'exam', 'other')),
  reason_note text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  is_late_notice boolean not null default false,
  submitted_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz
);

create table if not exists public.schedule_settings (
  id uuid primary key default gen_random_uuid(),
  work_date date not null,
  shift text not null check (shift in ('morning', 'afternoon', 'full_day')),
  min_staff integer not null default 2,
  max_staff integer not null default 8,
  note text,
  created_at timestamptz not null default now(),
  unique(work_date, shift)
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  message text not null,
  type text not null default 'info' check (type in ('info', 'ok', 'warn', 'err')),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists notifications_recipient_created_idx
on public.notifications (recipient_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.schedule_requests enable row level security;
alter table public.unavailability enable row level security;
alter table public.leave_requests enable row level security;
alter table public.schedule_settings enable row level security;
alter table public.notifications enable row level security;

create or replace function public.is_admin_user()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role_type in ('LEADER', 'ADMIN', 'SUPER_ADMIN')
      and status = 'active'
  );
$$;

create or replace function public.get_schedule_counts(
  p_start date,
  p_end date
)
returns table (
  work_date date,
  shift text,
  pending_count bigint,
  approved_count bigint,
  total_count bigint
)
language sql
security definer
set search_path = public
as $$
  select
    sr.work_date,
    sr.shift,
    count(*) filter (where sr.status = 'pending') as pending_count,
    count(*) filter (where sr.status = 'approved') as approved_count,
    count(*) filter (where sr.status in ('pending', 'approved')) as total_count
  from public.schedule_requests sr
  where sr.work_date between p_start and p_end
    and sr.status in ('pending', 'approved')
  group by sr.work_date, sr.shift
  order by sr.work_date, sr.shift;
$$;

grant execute on function public.get_schedule_counts(date, date) to authenticated;

-- PROFILES

drop policy if exists "Users can view own profile" on public.profiles;
create policy "Users can view own profile"
on public.profiles
for select
to authenticated
using (id = auth.uid() or public.is_admin_user());

drop policy if exists "Admins can manage profiles" on public.profiles;
create policy "Admins can manage profiles"
on public.profiles
for all
to authenticated
using (public.is_admin_user())
with check (public.is_admin_user());

-- SCHEDULE REQUESTS

drop policy if exists "Users can view own schedules" on public.schedule_requests;
create policy "Users can view own schedules"
on public.schedule_requests
for select
to authenticated
using (employee_id = auth.uid() or public.is_admin_user());

drop policy if exists "Users can create own schedules" on public.schedule_requests;
create policy "Users can create own schedules"
on public.schedule_requests
for insert
to authenticated
with check (employee_id = auth.uid());

drop policy if exists "Users can cancel own pending schedules" on public.schedule_requests;
create policy "Users can cancel own pending schedules"
on public.schedule_requests
for update
to authenticated
using (employee_id = auth.uid() and status = 'pending')
with check (employee_id = auth.uid());

drop policy if exists "Admins can manage schedules" on public.schedule_requests;
create policy "Admins can manage schedules"
on public.schedule_requests
for all
to authenticated
using (public.is_admin_user())
with check (public.is_admin_user());

-- UNAVAILABILITY

drop policy if exists "Users can view own unavailability" on public.unavailability;
create policy "Users can view own unavailability"
on public.unavailability
for select
to authenticated
using (employee_id = auth.uid() or public.is_admin_user());

drop policy if exists "Users can create own unavailability" on public.unavailability;
create policy "Users can create own unavailability"
on public.unavailability
for insert
to authenticated
with check (employee_id = auth.uid());

drop policy if exists "Users can update own unavailability" on public.unavailability;
create policy "Users can update own unavailability"
on public.unavailability
for update
to authenticated
using (employee_id = auth.uid())
with check (employee_id = auth.uid());

drop policy if exists "Admins can manage unavailability" on public.unavailability;
create policy "Admins can manage unavailability"
on public.unavailability
for all
to authenticated
using (public.is_admin_user())
with check (public.is_admin_user());

-- LEAVE REQUESTS

drop policy if exists "Users can view own leave requests" on public.leave_requests;
create policy "Users can view own leave requests"
on public.leave_requests
for select
to authenticated
using (employee_id = auth.uid() or public.is_admin_user());

drop policy if exists "Users can create own leave requests" on public.leave_requests;
create policy "Users can create own leave requests"
on public.leave_requests
for insert
to authenticated
with check (employee_id = auth.uid());

drop policy if exists "Admins can manage leave requests" on public.leave_requests;
create policy "Admins can manage leave requests"
on public.leave_requests
for all
to authenticated
using (public.is_admin_user())
with check (public.is_admin_user());

-- SETTINGS

drop policy if exists "All logged in users can view schedule settings" on public.schedule_settings;
create policy "All logged in users can view schedule settings"
on public.schedule_settings
for select
to authenticated
using (true);

drop policy if exists "Admins can manage schedule settings" on public.schedule_settings;
create policy "Admins can manage schedule settings"
on public.schedule_settings
for all
to authenticated
using (public.is_admin_user())
with check (public.is_admin_user());

-- NOTIFICATIONS

drop policy if exists "Users can view own notifications" on public.notifications;
create policy "Users can view own notifications"
on public.notifications
for select
to authenticated
using (recipient_id = auth.uid() or public.is_admin_user());

drop policy if exists "Users can mark own notifications as read" on public.notifications;
create policy "Users can mark own notifications as read"
on public.notifications
for update
to authenticated
using (recipient_id = auth.uid() or public.is_admin_user())
with check (recipient_id = auth.uid() or public.is_admin_user());

drop policy if exists "Admins can create notifications" on public.notifications;
create policy "Admins can create notifications"
on public.notifications
for insert
to authenticated
with check (public.is_admin_user());

drop policy if exists "Admins can manage notifications" on public.notifications;
create policy "Admins can manage notifications"
on public.notifications
for delete
to authenticated
using (public.is_admin_user());

-- Tạo profile admin từ email có sẵn trong Authentication.
-- Thay email/full_name/team nếu cần.
insert into public.profiles (
  id,
  employee_code,
  full_name,
  email,
  phone,
  role_type,
  team,
  min_days_per_month
)
select
  u.id,
  'ADMIN001',
  'Nguyễn Phi Trường',
  'unitemedia2010@gmail.com',
  '',
  'SUPER_ADMIN',
  'MEDIA',
  0
from auth.users u
where u.email = 'unitemedia2010@gmail.com'
on conflict (id) do update set
  employee_code = excluded.employee_code,
  full_name = excluded.full_name,
  email = excluded.email,
  phone = excluded.phone,
  role_type = excluded.role_type,
  team = excluded.team,
  min_days_per_month = excluded.min_days_per_month;
