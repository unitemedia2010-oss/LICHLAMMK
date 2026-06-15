# Unite Work Schedule v14 – Responsive Hotfix

Bản này sửa lỗi header mobile bị bóp chữ thành từng dòng và các nút tài khoản tràn khỏi màn hình. CSS v14 phải được tải sau `style.css` và `v13-enterprise-responsive.css`. Không cần chạy thêm SQL.

# Unite Work Schedule - UI Polished

Bản này tối ưu lại giao diện để hệ thống nhìn gọn, sang và dễ dùng hơn trên desktop/mobile, nhưng vẫn giữ nguyên các ID/class quan trọng để không ảnh hưởng luồng JS hiện tại.

## Cấu trúc

```text
unite-work-schedule-ui-polished/
├─ index.html
├─ employee.html
├─ admin.html
├─ debug.html
├─ css/
│  ├─ style.css
│  └─ employee-calendar-fix.css
├─ js/
│  ├─ config.js
│  ├─ auth.js
│  ├─ employee.js
│  └─ admin.js
├─ database/setup.sql
└─ docs/huong-dan-su-dung.md
```

## Điểm đã tối ưu

- Làm lại toàn bộ hệ màu theo hướng Unite: nền kem, đỏ đô, card trắng nổi khối.
- Tối ưu trang đăng nhập: card gọn, sang, dễ nhìn hơn.
- Tối ưu topbar, nút, form, input, bảng dữ liệu và modal.
- Tối ưu trang nhân sự: hero, progress tháng, metric card, legend, lịch tháng.
- Ô lịch đã gọn hơn, bỏ hiển thị thiếu/ổn/đông trong từng ngày để đỡ rối.
- Nút Đăng ký / Xin nghỉ chỉ hiện khi rê chuột hoặc nhấn vào ô ngày trên điện thoại.
- Trạng thái chờ duyệt dùng đỏ nhạt, đã duyệt xanh nhạt, xin nghỉ tím nhạt, lịch bận xanh dương nhạt.
- Popup thông báo nằm gần khu vực đăng xuất, bo góc và nổi rõ hơn.
- Admin được tối ưu lại card thống kê, bảng duyệt lịch, bảng duyệt nghỉ và tổng quan tuần.
- Sửa lại `debug.html` dùng đúng Supabase URL: `https://moohpectkjtpbyrqeocq.supabase.co`.

## Cách thay file

1. Copy toàn bộ thư mục này lên repo/web hiện tại.
2. Nếu chỉ muốn dán đè nhanh, thay các file sau:
   - `index.html`
   - `employee.html`
   - `admin.html`
   - `debug.html`
   - `css/style.css`
   - `css/employee-calendar-fix.css`
   - `js/config.js`
   - `js/auth.js`
   - `js/employee.js`
   - `js/admin.js`
3. Sau khi thay file, mở trình duyệt và bấm `Ctrl + Shift + R` để reload mạnh.

## Lưu ý

- Bản này không đổi database và không đổi logic duyệt lịch.
- File `js/config.js` đang dùng anon key public, không có service role key.
- Nếu GitHub Pages chưa cập nhật giao diện, kiểm tra đúng đường dẫn `css/style.css` và `css/employee-calendar-fix.css` đã được upload chưa.


## Bản v4 có gì mới

- Admin có nút **Xóa toàn bộ lịch làm** trong vùng nguy hiểm.
- Muốn xóa lịch phải nhập lại đúng mật khẩu admin.
- Trước khi xóa, hệ thống gửi thông báo cho toàn bộ tài khoản TTS/NVPT active.
- Nhân sự có thể xem thông báo trong nút **Thông báo** cạnh nút Đăng xuất.
- Có file `database/upgrade-v4.sql` để nâng cấp database cũ.
- Có hướng dẫn tạo tài khoản hàng loạt trong `docs/tao-tai-khoan-hang-loat.md`.

## Nâng cấp từ bản cũ

1. Copy đè toàn bộ code.
2. Vào Supabase SQL Editor.
3. Chạy file `database/upgrade-v4.sql`.
4. Reload web bằng Ctrl + Shift + R.

## V11 - Reference Clean Calendar

- Giao diện mobile bám theo sườn React tham khảo.
- Lịch tháng mobile dạng grid 7 cột gọn.
- Hôm nay chỉ tô viền vàng, không hiện chữ.
- Không cần chạy thêm SQL so với bản v8/v10.
