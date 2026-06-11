-- =========================================
-- UNITE WORK SCHEDULE - UPGRADE V6
-- Tính năng: TTS/NVPT tự cập nhật tên hiển thị và số điện thoại.
-- Chạy file này trong Supabase SQL Editor sau khi copy bản v6.
-- =========================================

create or replace function public.update_my_profile(
  p_full_name text,
  p_phone text default null
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if length(trim(coalesce(p_full_name, ''))) < 2 then
    raise exception 'Họ tên không hợp lệ';
  end if;

  update public.profiles
  set
    full_name = trim(p_full_name),
    phone = nullif(trim(coalesce(p_phone, '')), '')
  where id = auth.uid()
  returning * into v_profile;

  if not found then
    raise exception 'Không tìm thấy hồ sơ nhân sự';
  end if;

  return v_profile;
end;
$$;

grant execute on function public.update_my_profile(text, text) to authenticated;
