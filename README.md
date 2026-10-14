# Tarot 3D

Chạy bản xem trước: `node tools/serve.cjs`, sau đó mở http://127.0.0.1:4173.

Chạy kiểm thử: `node --test tests/*.test.cjs`.

Xem [báo cáo phân tích và sửa 3D](3D_REVIEW.md) để biết nguyên nhân, thay đổi, kết quả kiểm tra và giới hạn xác minh.

## Giao diện và tâm sự cùng Rót

- Chữ Lora và Be Vietnam Pro được lưu tại `fonts/`, có đầy đủ ký tự tiếng Việt và giấy phép OFL kèm theo. Không cần gọi Google Fonts khi mở trang.
- Nền cực quang và sao chuyển động bằng shader. Lúc giữ xáo bài, có 39 lá trên màn hình rộng và 26 lá trên điện thoại; tốc độ và ánh sáng tăng dần theo thời gian giữ. Thả tay sẽ gom bài lại trước khi chọn.
- Khử răng cưa phần cứng, độ phân giải tối đa 2× trên điện thoại / 2,5× trên màn hình rộng, lọc texture đến 16× và góc bài mịn hơn. Độ phân giải tự hạ trên thiết bị chậm. Chế độ giảm chuyển động của thiết bị vẫn được tôn trọng.
- Phần chọn có minh họa vuốt, nút trái/phải và thanh duyệt. Rút và lật bài có đường nâng/hạ mềm, hạt sáng và quầng sáng.
- `tarot-persona.js` quản lý mốc ngày của 12 cung hoàng đạo theo quy ước phổ biến, kiểm tra ngày hợp lệ/năm nhuận và bốn prompt riêng cho các tông giọng. Ngày giáp ranh được xác định theo ngày/tháng, không tính bản đồ sao theo giờ/nơi sinh.
- Tâm sự dùng đầy đủ các lá, vị trí, chiều bài, lời giải và lịch sử hội thoại. Sau lượt trả lời thành công thứ ba, giao diện thêm đúng một lời mời ủng hộ và link `https://hoahong.vercel.app/`. Khi lỗi kết nối, lượt đó không được tính. Tâm sự tiếp tục được lưu vào Sheet cũ.
- `tarot-audio.js` tạo tiếng giấy, gỗ và chuông với âm lượng thấp, đầu âm mềm, vang nhẹ; tắt âm sẽ giảm toàn bộ âm đang phát. Nền sáng sử dụng `tarot-atmosphere.js`.

Kiểm tra hình ảnh trực tiếp hiện bị giới hạn: trình duyệt kiểm tra không truy cập được bản xem trước; Computer Use dừng vì không xác định chắc chắn URL của Chrome. Kiểm thử mô phỏng không thay thế việc xem chuyển động trên GPU và nghe loa thật. Các phản hồi AI trong kiểm thử là mô phỏng; chất lượng văn phong thực tế còn phụ thuộc Gemini và API key khi chạy web.

## Google Sheets

Kết nối Sheet cũ được giữ riêng trong `sheets-config.js`; `tarot-sheets.js` gửi đúng giao thức của mã Google Apps Script hiện có. Khi cập nhật giao diện, giữ hai file này và các thẻ script tương ứng trong `index.html`.

Sheet nhận dữ liệu: https://docs.google.com/spreadsheets/d/1STZqTjCDzioE_ijRzKnkDyQO6XzxLW-SJm3fJATZniA/edit

Mỗi lượt giải thành công hoặc lỗi API ghi một dòng gồm: Thời gian, IP, Tên, Ngày sinh, Cung Hoàng Đạo, Giới tính, Câu hỏi, Số lá bài, Chế độ, Kết luận đầy đủ, Trạng thái, Đánh giá, Note Đánh giá, Góp ý, Câu hỏi thêm, Câu trả lời thêm, Người giải, Nguồn. GS tạo tab ngày `dd-MM-yyyy` theo giờ Việt Nam. Nguồn lấy từ `?ref=...`, mặc định `Trực tiếp / Không rõ`.

Chọn sao rồi nhấn **Gửi đánh giá** để ghi cả sao, ghi chú và góp ý. Phần hỏi thêm lưu toàn bộ các cặp hỏi/đáp vào cùng dòng. Các cập nhật đợi dòng gốc được ghi thành công và dùng nguyên thời gian + IP của lượt xem. Nếu tra IP thất bại, ghi `Không rõ`. Thời gian có mili giây để phân biệt các lượt xem nhanh.

Không cần thay mã GS hiện có. Mã cũ chỉ tìm bản ghi trong tab của ngày hiện tại, nên giao diện chặn cập nhật sau khi sang ngày mới để tránh sửa nhầm dòng theo IP. Kết nối phải cho phép khách truy cập web app; các phản hồi JSON lỗi được hiển thị, không báo lưu thành công khi chưa có xác nhận. Tham khảo triển khai web app: https://developers.google.com/apps-script/guides/web
