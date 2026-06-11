-- =========================================
-- UNITE WORK SCHEDULE - UPGRADE V4
-- Chạy file này trong Supabase SQL Editor nếu project đã setup từ bản cũ.
-- Tính năng: thông báo hệ thống cho nhân sự + admin reset toàn bộ lịch làm.
-- =========================================

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
