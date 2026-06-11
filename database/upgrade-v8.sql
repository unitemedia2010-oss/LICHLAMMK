-- =========================================
-- UNITE WORK SCHEDULE - UPGRADE V8
-- Tách quyền rõ: SUPER_ADMIN / ADMIN / LEADER
-- - SUPER_ADMIN: quản trị tài khoản, chỉnh role/chỉ tiêu, xóa toàn bộ lịch
-- - ADMIN/LEADER: xem và duyệt lịch, không quản trị tài khoản
-- Chạy trong Supabase SQL Editor sau khi copy bản v8.
-- =========================================

create or replace function public.is_super_admin_user()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role_type = 'SUPER_ADMIN'
      and status = 'active'
  );
$$;

grant execute on function public.is_super_admin_user() to authenticated;

-- PROFILES: Leader/Admin được xem để hiển thị lịch, nhưng chỉ SUPER_ADMIN được quản trị tài khoản.
drop policy if exists "Users can view own profile" on public.profiles;
drop policy if exists "Users and admins can view profiles" on public.profiles;
drop policy if exists "Admins can manage profiles" on public.profiles;
drop policy if exists "Super admins can insert profiles" on public.profiles;
drop policy if exists "Super admins can update profiles" on public.profiles;
drop policy if exists "Super admins can delete profiles" on public.profiles;

create policy "Users and admins can view profiles"
on public.profiles
for select
to authenticated
using (id = auth.uid() or public.is_admin_user());

create policy "Super admins can insert profiles"
on public.profiles
for insert
to authenticated
with check (public.is_super_admin_user());

create policy "Super admins can update profiles"
on public.profiles
for update
to authenticated
using (public.is_super_admin_user())
with check (public.is_super_admin_user());

create policy "Super admins can delete profiles"
on public.profiles
for delete
to authenticated
using (public.is_super_admin_user());

-- SCHEDULE REQUESTS: Admin/Leader được duyệt/từ chối, chỉ SUPER_ADMIN được xóa dữ liệu hàng loạt.
drop policy if exists "Admins can manage schedules" on public.schedule_requests;
drop policy if exists "Admins can update schedules" on public.schedule_requests;
drop policy if exists "Super admins can delete schedules" on public.schedule_requests;

create policy "Admins can update schedules"
on public.schedule_requests
for update
to authenticated
using (public.is_admin_user())
with check (public.is_admin_user());

create policy "Super admins can delete schedules"
on public.schedule_requests
for delete
to authenticated
using (public.is_super_admin_user());

-- LEAVE REQUESTS: Admin/Leader được duyệt/từ chối, chỉ SUPER_ADMIN được xóa khi reset lịch.
drop policy if exists "Admins can manage leave requests" on public.leave_requests;
drop policy if exists "Admins can update leave requests" on public.leave_requests;
drop policy if exists "Super admins can delete leave requests" on public.leave_requests;

create policy "Admins can update leave requests"
on public.leave_requests
for update
to authenticated
using (public.is_admin_user())
with check (public.is_admin_user());

create policy "Super admins can delete leave requests"
on public.leave_requests
for delete
to authenticated
using (public.is_super_admin_user());


-- Đảm bảo bảng notifications đã tồn tại nếu project chưa chạy upgrade-v4.sql.
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

alter table public.notifications enable row level security;

-- NOTIFICATIONS: user xem thông báo của mình, SUPER_ADMIN tạo/xóa thông báo hệ thống hàng loạt.
drop policy if exists "Users can view own notifications" on public.notifications;
drop policy if exists "Users can mark own notifications as read" on public.notifications;
drop policy if exists "Admins can create notifications" on public.notifications;
drop policy if exists "Admins can manage notifications" on public.notifications;
drop policy if exists "Super admins can create notifications" on public.notifications;
drop policy if exists "Super admins can delete notifications" on public.notifications;

create policy "Users can view own notifications"
on public.notifications
for select
to authenticated
using (recipient_id = auth.uid() or public.is_admin_user());

create policy "Users can mark own notifications as read"
on public.notifications
for update
to authenticated
using (recipient_id = auth.uid() or public.is_admin_user())
with check (recipient_id = auth.uid() or public.is_admin_user());

create policy "Super admins can create notifications"
on public.notifications
for insert
to authenticated
with check (public.is_super_admin_user());

create policy "Super admins can delete notifications"
on public.notifications
for delete
to authenticated
using (public.is_super_admin_user());

-- SCHEDULE SETTINGS nếu sau này dùng: chỉ SUPER_ADMIN được cấu hình hệ thống.
drop policy if exists "Admins can manage schedule settings" on public.schedule_settings;
drop policy if exists "Super admins can manage schedule settings" on public.schedule_settings;

create policy "Super admins can manage schedule settings"
on public.schedule_settings
for all
to authenticated
using (public.is_super_admin_user())
with check (public.is_super_admin_user());
