# V12 — Light Liquid Glass

## Thiết kế
- Giữ theme sáng và bố cục sạch của V11.
- Bổ sung lớp glass nhẹ bằng `backdrop-filter`, viền phản sáng và inner highlight.
- Hiệu ứng vàng `#FFD700` chỉ nằm dưới card/popup và dưới nền, không phủ vàng nội dung.
- Watermark `UNITE` cỡ lớn nằm dưới lớp blur.
- Ngày hôm nay chỉ có viền vàng, không thêm chữ.
- Mobile vẫn giữ lịch tháng 7 cột và popup chi tiết ngày.

## Hiệu năng
- Không bật drag cho card vì không phù hợp dashboard vận hành.
- SVG displacement được giới hạn ở scale thấp và chỉ áp dụng lên lớp highlight, không làm méo chữ.
- Mobile giảm cường độ blur.
- Hỗ trợ `prefers-reduced-motion`.

## Cài đặt
Copy đè toàn bộ source. Không cần chạy thêm SQL nếu database đã ở phiên bản V8 trở lên.
