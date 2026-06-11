# Đổi mật khẩu nội bộ

Bản v5 thêm nút **Đổi mật khẩu** cho:

- TTS/NVPT ở trang `employee.html`
- Leader/Admin ở trang `admin.html`

Luồng hoạt động:

1. Người dùng đăng nhập vào hệ thống.
2. Bấm **Đổi mật khẩu**.
3. Nhập mật khẩu hiện tại.
4. Nhập mật khẩu mới và nhập lại mật khẩu mới.
5. Hệ thống xác thực lại mật khẩu hiện tại bằng email/password.
6. Nếu đúng, hệ thống cập nhật mật khẩu mới cho chính tài khoản đang đăng nhập.

Lưu ý bảo mật:

- Không cần `service_role key`.
- Không đưa secret key vào frontend.
- Mật khẩu mới tối thiểu 8 ký tự.
