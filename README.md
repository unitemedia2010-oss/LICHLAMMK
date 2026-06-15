# Unite Work Schedule v15 — Monthly Draft Workflow

## Luồng đăng ký mới

1. Nhân viên bấm vào ngày trên lịch.
2. Chọn một trong bốn lựa chọn:
   - Cả ngày
   - Buổi sáng
   - Buổi chiều
   - OFF
3. Lựa chọn được lưu vào **bản nháp tháng**, chưa gửi lên admin.
4. Nhân viên có thể sửa hoặc xóa từng ngày trong phần **Xem lại trước khi nộp**.
5. Khi hoàn tất, bấm **Nộp lịch tháng**.
6. Ngày làm được gửi sang trạng thái **Chờ duyệt**; ngày OFF được chốt và hiển thị trên lịch admin.
7. Sau khi lịch làm đã được nộp và duyệt, muốn nghỉ phải gửi yêu cầu xin nghỉ.

## Thông báo

- Lưu/sửa/xóa bản nháp: thông báo nhanh trên màn hình.
- Nộp lịch tháng thành công: lưu vào trung tâm Thông báo.
- Admin vẫn thấy tên nhân sự, ca làm và OFF trong lịch tháng.

## Lưu ý

- Bản nháp được lưu trong trình duyệt hiện tại bằng localStorage. Nếu đổi máy hoặc xóa dữ liệu trình duyệt trước khi nộp, bản nháp chưa nộp sẽ không đi theo.
- Không cần chạy thêm SQL cho bản v15 nếu database của các bản trước đã hoạt động.
- Copy đè toàn bộ thư mục lên source hiện tại và reload mạnh bằng Ctrl + Shift + R.
