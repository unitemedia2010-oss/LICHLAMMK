# Hướng dẫn sử dụng Unite Work Schedule

## 1. Tạo tài khoản nhân sự

Bước 1: Vào Supabase → Authentication → Users → Add user.

Ví dụ:
- Email: tts01@unite.test
- Password: 12345678
- Auto Confirm User: bật

Bước 2: Chạy SQL tạo profile:

```sql
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
  'TTS001',
  'Nguyễn Văn Test',
  'tts01@unite.test',
  '',
  'TTS',
  'MEDIA',
  12
from auth.users u
where u.email = 'tts01@unite.test'
on conflict (id) do update set
  employee_code = excluded.employee_code,
  full_name = excluded.full_name,
  email = excluded.email,
  phone = excluded.phone,
  role_type = excluded.role_type,
  team = excluded.team,
  min_days_per_month = excluded.min_days_per_month;
```

## 2. TTS/NVPT đăng ký lịch

- Đăng nhập vào `index.html`.
- Hệ thống tự chuyển sang `employee.html`.
- Bấm nút **Đăng ký** trên ngày muốn làm.
- Chọn ca sáng/chiều/cả ngày.
- Bấm **Gửi đăng ký**.

## 3. Admin duyệt lịch

- Admin đăng nhập.
- Vào `admin.html`.
- Tick các dòng trong **Yêu cầu đăng ký lịch đang chờ**.
- Bấm **Duyệt đã chọn** hoặc **Từ chối đã chọn**.

## 4. Xin nghỉ

- TTS/NVPT chỉ xin nghỉ được với ngày đã duyệt.
- Bấm **Xin nghỉ** trong ô ngày đã duyệt.
- Chọn lý do và gửi.
- Admin duyệt trong mục **Yêu cầu xin nghỉ đang chờ**.

## 5. Debug kết nối

Nếu đăng nhập lỗi:
- Mở `debug.html`.
- Bấm Test Health.
- Bấm Test Đăng nhập.
- Bấm Test Profile.
- Xem lỗi hiển thị trong khung log.
