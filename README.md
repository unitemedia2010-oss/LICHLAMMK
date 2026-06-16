# Unite Work Schedule V20

Bản V20 bổ sung **lịch học/lịch bận ngay trong popup chọn lịch của từng ngày** và hỗ trợ xóa lịch bận trực tiếp.

## Thay đổi V20

- Popup **Chọn lịch ngày** có thêm khu vực **Lịch học / lịch bận**.
- Nhân viên bật công tắc, chọn ca bận, lý do và ghi chú ngay tại popup.
- Lịch bận được lưu trực tiếp lên Supabase, không phụ thuộc thao tác nộp lịch tuần.
- Khi ngày đã có lịch bận, popup hiển thị trạng thái đã lưu và nút **Xóa lịch bận**.
- Xóa lịch bận sẽ chuyển bản ghi sang trạng thái `cancelled`, nên không còn hiển thị trên lịch nhưng vẫn giữ được lịch sử dữ liệu.
- Chặn chọn ca làm trùng với ca đã báo bận:
  - Bận sáng không thể đăng ký ca sáng hoặc cả ngày.
  - Bận chiều không thể đăng ký ca chiều hoặc cả ngày.
  - Bận cả ngày chỉ có thể chọn OFF hoặc cập nhật/xóa lịch bận.
- Giao diện bản nháp được đồng bộ hoàn toàn sang **nộp lịch tuần**.
- Chủ Nhật tiếp tục là ngày nghỉ hàng tuần và bị khóa đăng ký.
- Form xin nghỉ có đầy đủ lựa chọn toàn ca, nửa đầu ca, nửa cuối ca và chọn giờ cụ thể.
- Bỏ form lịch bận rời để tránh nhân viên phải tìm ở nhiều nơi.

## Cập nhật từ V19

Không cần chạy thêm SQL và không cần deploy lại Edge Function.

Chỉ cần thay các file frontend sau trên GitHub:

```text
employee.html
css/app.css
js/employee.js
```

Có thể thay toàn bộ source V20 để giữ phiên bản cache đồng nhất.

Sau khi push lên GitHub và Netlify deploy xong, mở website rồi nhấn:

```text
Ctrl + Shift + R
```

Các đường dẫn asset phải hiển thị `?v=20`.

## Cấu trúc source

```text
index.html
admin.html
employee.html
css/app.css
js/config.js
js/auth.js
js/admin.js
js/employee.js
supabase/config.toml
supabase/functions/admin-create-user/index.ts
supabase/migrations/001_setup.sql
supabase/migrations/002_weekly_flexible_leave.sql
```

## Cài đặt mới hoàn toàn

1. Chạy `supabase/migrations/001_setup.sql`.
2. Chạy `supabase/migrations/002_weekly_flexible_leave.sql`.
3. Deploy Edge Function:

```powershell
npx.cmd supabase login
npx.cmd supabase link --project-ref moohpectkjtpbyrqeocq
npx.cmd supabase functions deploy admin-create-user --no-verify-jwt
```

4. Đưa frontend lên GitHub Pages hoặc Netlify.

Không đưa `SUPABASE_SERVICE_ROLE_KEY` vào mã nguồn frontend hoặc GitHub.
