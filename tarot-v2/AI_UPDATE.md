# Lời giải và dự phòng API — 15/10/2026

Đã đối chiếu tab 15-10-2026 trong Sheet nhật ký theo yêu cầu của chủ trang. Trong vùng gần nhất A353:R452 có cả lỗi kết nối, timeout, BUSY và lượt thành công qua Intern/Groq. Ví dụ J407 ghi phản hồi chậm; các lượt 09:11 ghi kết nối/BUSY liên tiếp; Q451 ghi Groq thành công. Không sao chép tên, IP, ngày sinh hoặc câu hỏi riêng vào báo cáo.

Nhật ký cũ chỉ có thông báo giao diện và “Chưa có lời giải”, thiếu mã API và chuỗi đã thử. Vì vậy không thể khẳng định mọi lỗi là do Intern hoặc mọi lần Groq đều bị bỏ qua. Nhiều lỗi là mất phản hồi giữa trình duyệt và Apps Script; đổi nhà cung cấp AI không tự sửa được đường truyền này.

## Prompt

Phiên bản 4: Rót chào theo tên/biệt danh thật nếu có, mặc định Rót–bạn, không đoán tuổi/giới tính để gọi anh/chị/em. Giới tính đã nhập được đưa qua snapshot, kiểm tra ở máy chủ và giữ trong ngữ cảnh. Hồ sơ không bị đọc lại máy móc; không gán tính cách từ cung/ngày sinh.

Lời nói tự nhiên, có chút duyên nhưng không nịnh, không lạm dụng tiếng đệm. Mỗi lá khoảng 65–95 từ, một lá có thể 90–125 từ; kết luận trả lời ngay câu đầu, nối các vị trí và nêu điều kiện/rủi ro. Gợi ý có cách bắt đầu và dấu hiệu đánh giá. Định dạng JSON đã sửa cùng prompt, tránh schema cũ ép câu trả lời về 2–3 câu và cho phép bỏ lời chào. Nếu dịch vụ vẫn để trống lời chào, phần xử lý thêm một lời chào trung tính theo tên, không bịa nội dung.

So với hỏi một chatbot trống: hệ thống đưa đúng bộ lá được rút, vị trí, chiều xuôi/ngược, câu hỏi, hồ sơ tùy chọn và bối cảnh tâm sự qua cùng chính sách đọc. So với một người đọc trực tiếp: vẫn thiếu trao đổi làm rõ tức thì, sắc thái giọng nói và quan sát; không coi đây là tiên đoán chắc chắn hoặc thay thế chuyên môn cho quyết định quan trọng.

## Độ ổn định

- Intern tối đa 45 giây, Groq 35 giây, Gemini 45 giây mỗi lần gọi; tổng thời gian chờ upstream theo cấu hình là 125 giây, dành phần còn lại cho đường truyền và xử lý. Dùng tham số timeoutSeconds được Google công bố: https://developers.google.com/apps-script/reference/url-fetch/url-fetch-app#fetch(String,Object).
- 401/403/429, lỗi máy chủ/kết nối, timeout, JSON hỏng và lời giải thiếu chuyển sang nhà cung cấp sau. Thời gian nghỉ thuộc từng dịch vụ. Lỗi đọc cooldown không chặn toàn chuỗi.
- Lỗi ghi cache sau khi có lời giải không làm mất câu trả lời hoặc gọi thêm nhà cung cấp.
- checkAIConnections tiếp tục với Groq/Gemini dù kiểm tra Intern ném lỗi; mỗi lần kiểm tra kết nối giới hạn 10 giây.
- Trình duyệt gộp các yêu cầu trùng đang chạy, tự lấy lại phản hồi có giới hạn sau lỗi đường truyền, chờ lượt BUSY bằng cùng snapshot. Máy chủ dùng cache/khóa theo payload để tránh sinh lại khi yêu cầu trước đang chạy. Không áp dụng việc gửi lại này cho thao tác ghi Sheet.
- BUSY không còn bị báo thành hết hạn mức ở lần thử sau. Nhật ký mới ghi mã kết nối và chuỗi provider/code/HTTP/thời gian trong cột Người giải; không chứa khóa hoặc nội dung lỗi thô từ dịch vụ.

## Kiểm tra và triển khai

Chạy node --test tarot-v2/tests/*.test.cjs tests/ai.test.cjs tests/apps-script.test.cjs tests/persona.test.cjs tests/reading.test.cjs tests/transport.test.cjs.

84/84 kiểm thử trong phạm vi trên đạt, gồm Intern bị treo → Groq, cả ba timeout, cooldown hỏng, dữ liệu cá nhân, yêu cầu trùng, mất mạng → BUSY → lấy được kết quả, bảo toàn snapshot và không lộ khóa. Không gọi sinh lời giải trả phí trong các kiểm thử.

Bộ kiểm tra toàn thư mục gốc còn 5 lỗi trong scene.test.cjs của giao diện 3D cũ. Đã chạy đối chiếu với các module AI/prompt trước lần sửa này và tái hiện cùng 5 lỗi; chúng không phát sinh từ bản sửa prompt/dự phòng. V2 và các kiểm tra AI/prompt liên quan đạt.

Bản máy chủ trước thay đổi là phiên bản 20, cùng địa chỉ /exec đang cấu hình. Đã lưu bản nguồn máy chủ trước chỉnh sửa trong backups/prompt-fallback-20261015 (không đóng gói lên web). Mã mới được dựng bằng node tarot-v2/apps-script/build.cjs. Không thay khóa, quyền truy cập, cấu trúc 18 cột hoặc địa chỉ Sheet.

Đã cập nhật thành công bản triển khai đang dùng từ phiên bản 20 lên **21**, lúc 09:50 ngày 15/10/2026 theo màn hình quản lý Apps Script. Không tạo địa chỉ API mới.
