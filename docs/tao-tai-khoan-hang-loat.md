# Tạo nhiều tài khoản nhân sự / TTS

## Cách nhanh cho ít tài khoản

1. Vào Supabase → Authentication → Users → Add user.
2. Nhập email, mật khẩu, bật Auto Confirm User.
3. Sau đó tạo profile cho tài khoản đó trong bảng `profiles`.

Ví dụ SQL tạo profile cho 1 tài khoản:

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
  '0900000001',
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

## Cách hàng loạt bằng CSV

Dùng khi cần tạo nhiều tài khoản.

1. Copy file `tools/users-sample.csv` thành `tools/users.csv`.
2. Điền danh sách tài khoản theo cột:

```csv
email,password,employee_code,full_name,phone,role_type,team,min_days_per_month
tts01@unite.test,12345678,TTS001,Nguyễn Văn Test,0900000001,TTS,MEDIA,12
```

3. Vào Supabase → Project Settings → API → copy `service_role key`.

4. Mở terminal PowerShell tại thư mục project rồi chạy:

```powershell
$env:SUPABASE_URL="https://moohpectkjtpbyrqeocq.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="DÁN_SERVICE_ROLE_KEY_Ở_ĐÂY"
node tools/create-users-from-csv.js tools/users.csv
```

## Cảnh báo bảo mật

- Không đưa `service_role key` vào `js/config.js`.
- Không đưa `service_role key` lên GitHub.
- Không chạy script tạo user trên trình duyệt/frontend.
- Chỉ dùng `service_role key` ở máy cá nhân hoặc backend bảo mật.
