# Hướng dẫn cập nhật bản V6

## Nội dung đã sửa

- Đưa khu **Xóa toàn bộ lịch làm** xuống cuối trang Admin.
- Thêm khu **Cấu hình nhân sự** trên Admin để sửa:
  - Họ tên hiển thị
  - Vai trò TTS/NVPT/LEADER
  - Team
  - Chỉ tiêu tháng
  - Trạng thái active/inactive
- Thêm nút **Sửa tên** ở trang nhân sự để TTS/NVPT tự cập nhật đúng họ tên.
- Lịch tháng Admin ưu tiên hiển thị `full_name`; nếu tên chưa cập nhật hoặc bị nhập giống email thì sẽ fallback về mã nhân sự/email.

## Cần chạy SQL

Sau khi copy đè code, vào Supabase → SQL Editor và chạy:

```sql
-- file database/upgrade-v6.sql
```

Nếu không chạy file này, nhân sự bấm **Sửa tên** sẽ báo lỗi vì database chưa có hàm `update_my_profile`.

## Lưu ý

Admin/Leader sửa tên và chỉ tiêu trực tiếp tại khu **Cấu hình nhân sự**. TTS/NVPT chỉ tự sửa được tên hiển thị và số điện thoại của chính mình.
