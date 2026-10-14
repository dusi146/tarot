# Tarot 3D

Chạy bản xem trước: `node tools/serve.cjs`, sau đó mở http://127.0.0.1:4173.

Chạy kiểm thử: `node --test tests/*.test.cjs`.

Xem [báo cáo phân tích và sửa 3D](3D_REVIEW.md) để biết nguyên nhân, thay đổi, kết quả kiểm tra và giới hạn xác minh.

## Giao diện và tâm sự cùng Rót

- Chữ Lora và Be Vietnam Pro được lưu tại `fonts/`, có đầy đủ ký tự tiếng Việt và giấy phép OFL kèm theo. Không cần gọi Google Fonts khi mở trang.
- Nền cực quang và sao chuyển động bằng shader. Lúc giữ xáo bài, có 39 lá trên màn hình rộng và 26 lá trên điện thoại; tốc độ và ánh sáng tăng dần theo thời gian giữ. Thả tay sẽ gom bài lại trước khi chọn.
- Khử răng cưa nhiều lớp trong `tarot-render.js`: MSAA theo khả năng GPU, lọc cạnh sau khi dựng hình và ưu tiên dựng ở 2×, tối đa 2,5× trên điện thoại / 3× trên màn hình rộng. Giới hạn tổng số điểm ảnh và tự giảm chất lượng khi thiết bị chậm; chữ và menu không đi qua bộ lọc 3D. Ảnh bài dùng mipmap trilinear và lọc nghiêng đến 16×; viền phát sáng dùng khoảng cách bo góc và đạo hàm màn hình để làm mềm cạnh. Chế độ giảm chuyển động của thiết bị vẫn được tôn trọng.
- `tarot-reading.js` giữ màu theo vai trò của vị trí bài, thống nhất giữa khung nhận bài, viền, tên lá và phần phân tích: tím để nhìn lại, xanh ngọc cho hiện tại/lời khuyên, vàng cho hướng đi. Các kiểu trải khác có thêm xanh lá, xanh lam và hồng đất. Màu không khẳng định tốt/xấu hay vận mệnh. Lời giải chia từng lá, góc nhìn chung và việc có thể làm; dùng văn bản thuần, bỏ Markdown/emoji trang trí, giữ dấu tiếng Việt. Nội dung AI luôn được hiển thị bằng `textContent`.
- Phần chọn có minh họa vuốt, nút trái/phải và thanh duyệt. Rút và lật bài có đường nâng/hạ mềm, hạt sáng và quầng sáng.
- `tarot-persona.js` quản lý mốc ngày của 12 cung hoàng đạo theo quy ước phổ biến, kiểm tra ngày hợp lệ/năm nhuận và bốn prompt riêng cho các tông giọng. Ngày giáp ranh được xác định theo ngày/tháng, không tính bản đồ sao theo giờ/nơi sinh.
- Tâm sự dùng đầy đủ các lá, vị trí, chiều bài, lời giải và lịch sử hội thoại. Sau lượt trả lời thành công thứ ba, giao diện thêm đúng một lời mời ủng hộ và link `https://hoahong.vercel.app/`. Khi lỗi kết nối, lượt đó không được tính. Tâm sự tiếp tục được lưu vào Sheet cũ.
- `tarot-audio.js` tạo tiếng giấy, gỗ và chuông với âm lượng thấp, đầu âm mềm, vang nhẹ; tắt âm sẽ giảm toàn bộ âm đang phát. Nền sáng sử dụng `tarot-atmosphere.js`.
- Intro dùng đúng ba lá của cảnh chính: bay quanh nhau, về vị trí chính, logo/tên đi lên góc rồi menu xuất hiện. Có nút bỏ qua và tự rút gọn khi bật giảm chuyển động.
- Tùy chỉnh thêm có màu vàng và mở/đóng bằng chuyển động có thể đảo chiều giữa chừng. Lá được chọn bay tới đúng khung ảnh ở hàng dưới; khi đủ lá, dừng nhẹ rồi bay lần lượt lên bàn.
- Các file giao diện và mã chạy có mã phiên bản trong `index.html`; tăng mã này khi sửa để trình duyệt nhận đúng bản mới. Workflow triển khai cũng đổi mã này thành mã commit. Repo hiện có cả xuất bản Pages từ nhánh và workflow riêng, nên bản nguồn giữ sẵn một mã hợp lệ cho cả hai cách xuất bản.
- Khi giữ xáo, thay phần trăm bằng những lời nhắn chậm rãi. `tarot-profile.js` nhớ tên, giới tính, ngày sinh, tông giọng và kiểu trải bài trong trình duyệt hiện tại; có nút quên thông tin. Không lưu câu hỏi hay tâm sự vào bộ nhớ này. Không đồng bộ hồ sơ giữa các thiết bị.

Đã kiểm tra giao diện trên web public ở khung 1280×720 và 390×844: intro, tùy chỉnh, khung nhận bài và nhóm bài bay lên; trình duyệt không báo lỗi đồ họa. Đã nhập thông tin thử và xác nhận khôi phục đúng sau khi tải lại. Trình duyệt kiểm tra không truy cập được bản xem trước tại máy, nên việc xác minh hình ảnh được thực hiện sau triển khai. Chưa kiểm tra âm thanh trên loa thật. Các phản hồi AI trong kiểm thử là mô phỏng; chất lượng văn phong thực tế còn phụ thuộc Gemini và API key khi chạy web.

## Google Sheets

Kết nối Sheet cũ được giữ riêng trong `sheets-config.js`; `tarot-sheets.js` gửi đúng giao thức của mã Google Apps Script hiện có. Khi cập nhật giao diện, giữ hai file này và các thẻ script tương ứng trong `index.html`.

Sheet nhận dữ liệu: https://docs.google.com/spreadsheets/d/1STZqTjCDzioE_ijRzKnkDyQO6XzxLW-SJm3fJATZniA/edit

Mỗi lượt giải thành công hoặc lỗi API ghi một dòng gồm: Thời gian, IP, Tên, Ngày sinh, Cung Hoàng Đạo, Giới tính, Câu hỏi, Số lá bài, Chế độ, Kết luận đầy đủ, Trạng thái, Đánh giá, Note Đánh giá, Góp ý, Câu hỏi thêm, Câu trả lời thêm, Người giải, Nguồn. GS tạo tab ngày `dd-MM-yyyy` theo giờ Việt Nam. Nguồn lấy từ `?ref=...`, mặc định `Trực tiếp / Không rõ`.

Chọn sao rồi nhấn **Gửi đánh giá** để ghi cả sao, ghi chú và góp ý. Phần hỏi thêm lưu toàn bộ các cặp hỏi/đáp vào cùng dòng. Các cập nhật đợi dòng gốc được ghi thành công và dùng nguyên thời gian + IP của lượt xem. Nếu tra IP thất bại, ghi `Không rõ`. Thời gian có mili giây để phân biệt các lượt xem nhanh.

Để bật Groq, cần cập nhật Apps Script theo [GROQ_SETUP.md](GROQ_SETUP.md). File `apps-script/Code.gs` gồm đầy đủ các chức năng Sheet cũ và API Groq phía máy chủ. Khóa chỉ nằm trong Script properties dưới tên `GROQ_API_KEY`; không chèn khóa vào JavaScript hay GitHub Pages. Workflow đã bỏ bước chèn Gemini key vào mã công khai. Phiên bản GS mới cập nhật theo đúng thời gian + IP, không dùng IP làm phương án sửa dòng thay thế.

Giao diện vẫn chặn cập nhật sau khi sang ngày mới để tương thích và tránh sửa nhầm nếu bản GS cũ còn chạy. Kết nối phải cho phép khách truy cập web app; các phản hồi JSON lỗi được hiển thị, không báo lưu thành công khi chưa có xác nhận. Tham khảo triển khai web app: https://developers.google.com/apps-script/guides/web

## Groq qua Apps Script

`tarot-ai.js` gửi danh tính các lá, chiều bài, hồ sơ và câu hỏi sang Apps Script. Máy chủ dựng lại prompt bằng cùng `tarot-persona.js` và danh mục 78 lá; dùng model `openai/gpt-oss-120b`. Tâm sự giữ lời giải đầy đủ và lịch sử theo thứ tự. Trình duyệt kiểm tra `ai_health` trước khi gửi AI, nên bản GS cũ sẽ không ghi nhầm yêu cầu AI thành dòng Sheet.

Mã máy chủ được đóng gói bằng `node tools/build-apps-script.cjs`. Các thay đổi prompt hoặc danh mục cần đóng gói và triển khai GS lại. Có dùng lại lời giải giống hệt trong 5 phút, giới hạn mềm 6 yêu cầu/phút toàn web và thời gian chờ chung khi Groq trả 429. Không tự gửi dồn yêu cầu hoặc đổi key để né quota. Hướng dẫn cấu hình, triển khai và cách cất khóa GitHub: [GROQ_SETUP.md](GROQ_SETUP.md).

Lời giải dùng Structured Outputs với nội dung riêng cho từng lá, tổng hợp và hành động. Máy chủ kiểm tra nội dung trước khi ghép thành văn bản; trình duyệt cũng từ chối phần thiếu thay vì hiển thị tiêu đề rỗng hoặc ghi thành công. Có nút thử lại ngay trên trải bài. Góc nhìn chung trả lời trọng tâm ngay câu đầu, khoảng 3 câu, giữ tông giọng nhưng giảm lặp lại ý nghĩa lá bài. Bản GS mới báo `readingFormat:2` ở `ai_health`; cần cập nhật GS để prompt này có hiệu lực.

`tarot-transport.js` dùng URL mới cho mỗi yêu cầu và `cache: no-store`. Khi ContentService chuyển hướng sang `script.googleusercontent.com` rồi trả 404, trình duyệt chờ 1, 2, 4 giây và chỉ GET lại đúng URL phản hồi, không gửi lại POST tạo lời giải hoặc ghi Sheet. Cơ chế này dùng chung cho AI, lịch sử/đánh giá và danh sách ủng hộ. Lỗi vĩnh viễn vẫn được báo sau số lần thử giới hạn. [Google mô tả đường dẫn phản hồi một lần](https://developers.google.com/apps-script/guides/content#redirects).
