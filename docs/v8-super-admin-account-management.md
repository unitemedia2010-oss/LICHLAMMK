# V8 - SUPER_ADMIN / ADMIN / LEADER và Quản trị tài khoản

## 1. Phân quyền

| Vai trò | Quyền |
|---|---|
| SUPER_ADMIN | Tạo tài khoản, sửa role, sửa team, sửa chỉ tiêu tháng, khóa/mở hồ sơ, xóa toàn bộ lịch làm |
| ADMIN | Xem lịch, duyệt/từ chối lịch, duyệt/từ chối nghỉ |
| LEADER | Xem lịch, duyệt/từ chối lịch, duyệt/từ chối nghỉ |
| TTS/NVPT | Đăng ký lịch, xin nghỉ, sửa tên của mình, đổi mật khẩu |

Leader không thấy mục **Quản trị tài khoản**.

## 2. Chạy SQL nâng cấp

Vào Supabase → SQL Editor → chạy:

```sql
-- copy nội dung file database/upgrade-v8.sql
```

Nếu muốn set một email thành SUPER_ADMIN:

```sql
update public.profiles
set role_type = 'SUPER_ADMIN', status = 'active'
where lower(email) = lower('EMAIL_CUA_SUPER_ADMIN@gmail.com');
```

## 3. Deploy Edge Function để tạo tài khoản ngay trong web

Tính năng **Tạo tài khoản** trong web cần Edge Function vì tạo Auth user cần `service_role key`. Không được đưa key này vào frontend.

Cài Supabase CLI, đăng nhập, link project rồi chạy trong thư mục project:

```bash
supabase login
supabase link --project-ref moohpectkjtpbyrqeocq
supabase secrets set SUPABASE_SERVICE_ROLE_KEY="DAN_SERVICE_ROLE_KEY_CUA_PROJECT"
supabase functions deploy admin-create-user --no-verify-jwt
```

Sau đó tài khoản SUPER_ADMIN vào Admin → **Quản trị tài khoản** → nhập email, mật khẩu tạm, mã nhân sự, họ tên, role, team, chỉ tiêu tháng → bấm **Tạo tài khoản**.

## 4. Nếu chưa deploy Edge Function

SUPER_ADMIN vẫn xem/sửa được danh sách tài khoản đã có trong bảng `profiles`, nhưng nút **Tạo tài khoản** sẽ báo lỗi không gọi được Edge Function.
