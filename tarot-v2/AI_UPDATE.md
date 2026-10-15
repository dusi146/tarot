# Lời giải và dự phòng API — 15/10/2026

## Cập nhật tiếp theo: Groq → Gemini → Intern

Theo yêu cầu mới của chủ trang, thứ tự hiện tại là **Groq → Gemini → Intern**, áp dụng cả đọc trải bài và tâm sự. Thông tin Intern đứng đầu bên dưới là lịch sử phiên bản trước. Cache dùng phiên bản mới để không trả lại lời giải theo cấu hình cũ.

Đã kiểm tra sinh lời giải thực tế bằng câu hỏi giả lập, không ghi Sheet: Groq thành công trong 1.278 ms; Gemini thành công sau 122.241 ms; Intern trả lời thiếu sau 21.034 ms. Các phép thử Intern trước đó với prompt đầy đủ bị timeout khoảng 44,4 giây, trong khi yêu cầu JSON ngắn trả HTTP 200 trong 2–4 giây. Vì vậy không kết luận cả ba dịch vụ đều ổn chỉ từ /models hoặc chỉ quy lỗi cho khóa. Tham số tắt suy luận của DeepSeek hoạt động trong phép thử ngắn, nhưng chưa bảo đảm lời giải đầy đủ luôn thành công.

Cấu hình timeoutSeconds mới là 25/35/25 giây; timeout nghỉ 120 giây cho riêng dịch vụ lỗi. Thời gian thực tế có thể vượt cấu hình như phép thử Gemini nói trên, nên **85 giây chỉ là tổng tham số cấu hình, không phải giới hạn thực tế đã chứng minh**. Tăng ngân sách đầu ra theo số lá (3.072–6.144 token), giữ mã HTTP khi phản hồi JSON hỏng. Thêm checkAIGeneration để kiểm tra sinh lời giải thật, không in khóa/nội dung hoặc ghi Sheet.

88/88 kiểm thử liên quan đạt, gồm thứ tự mới, mọi nhánh dự phòng, timeout mô phỏng, đủ nội dung bốn lá và bảo toàn ngữ cảnh tâm sự. Đã lưu nguồn phiên bản máy chủ 23 trong backups/prompt-fallback-20261015/Code.server-v23.gs để đối chiếu.

Đã triển khai **Apps Script 24** lúc 10:29 ngày 15/10/2026 trên cùng địa chỉ /exec. Lượt xác minh sau triển khai lúc 10:30 thành công qua Groq, lời giải 1.348 ký tự; health công khai trả đúng thứ tự Groq, Gemini, Intern. Không ghi dữ liệu mẫu vào Sheet.

Đã đối chiếu tab 15-10-2026 trong Sheet nhật ký theo yêu cầu của chủ trang. Trong vùng gần nhất A353:R452 có cả lỗi kết nối, timeout, BUSY và lượt thành công qua Intern/Groq. Ví dụ J407 ghi phản hồi chậm; các lượt 09:11 ghi kết nối/BUSY liên tiếp; Q451 ghi Groq thành công. Không sao chép tên, IP, ngày sinh hoặc câu hỏi riêng vào báo cáo.

Nhật ký cũ chỉ có thông báo giao diện và “Chưa có lời giải”, thiếu mã API và chuỗi đã thử. Vì vậy không thể khẳng định mọi lỗi là do Intern hoặc mọi lần Groq đều bị bỏ qua. Nhiều lỗi là mất phản hồi giữa trình duyệt và Apps Script; đổi nhà cung cấp AI không tự sửa được đường truyền này.

## Prompt

Phiên bản 6: Rót chào theo tên/biệt danh thật nếu có, mặc định Rót–bạn, không đoán tuổi/giới tính để gọi anh/chị/em. Giới tính đã nhập được đưa qua snapshot, kiểm tra ở máy chủ và giữ trong ngữ cảnh. Hồ sơ không bị đọc lại máy móc; không gán tính cách từ cung/ngày sinh.

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

85/85 kiểm thử trong phạm vi trên đạt, gồm Intern bị treo → Groq, cả ba timeout, cooldown hỏng, dữ liệu cá nhân, yêu cầu trùng, mất mạng → BUSY → lấy được kết quả, bảo toàn snapshot và không lộ khóa. Không gọi sinh lời giải trả phí trong các kiểm thử.

Bộ kiểm tra toàn thư mục gốc còn 5 lỗi trong scene.test.cjs của giao diện 3D cũ. Đã chạy đối chiếu với các module AI/prompt trước lần sửa này và tái hiện cùng 5 lỗi; chúng không phát sinh từ bản sửa prompt/dự phòng. V2 và các kiểm tra AI/prompt liên quan đạt.

Bản máy chủ trước thay đổi là phiên bản 20, cùng địa chỉ /exec đang cấu hình. Đã lưu bản nguồn máy chủ trước chỉnh sửa trong backups/prompt-fallback-20261015 (không đóng gói lên web). Mã mới được dựng bằng node tarot-v2/apps-script/build.cjs. Không thay khóa, quyền truy cập, cấu trúc 18 cột hoặc địa chỉ Sheet.

Đã cập nhật thành công bản triển khai đang dùng từ phiên bản 20 lên **21**, lúc 09:50 ngày 15/10/2026 theo màn hình quản lý Apps Script. Không tạo địa chỉ API mới.

Xác minh sau triển khai: health trả promptVersion=6, fallbackVersion=2; cả ba dịch vụ đã có cấu hình. GitHub Pages chạy thành công cho commit c89ce33; HTML công khai và các tệp app.js/tarot-ai.js đã trả đúng bản này. Sau các kiểm thử mô phỏng, đã chạy một lượt đọc thật bằng tên/câu hỏi giả lập, không ghi Sheet: Intern báo PROVIDER_ERROR, Groq tiếp nhận và trả lời thành công trong khoảng 2 giây. Đã dùng lời đáp này để chỉnh thêm mẫu giọng và ngăn việc tự gán sợ hãi/trốn tránh cho người xem.

Lần hiệu chỉnh cuối dùng Prompt 6 và bản triển khai Apps Script 23, cùng địa chỉ /exec. Kiểm tra kết nối thật ở 09:58 ngày 15/10/2026 trả HTTP 200 cho Intern, Groq và Gemini.

Mẫu đọc thật thứ hai cũng chuyển Intern lỗi sang Groq thành công, sau khoảng 44,7 giây chờ Intern và 2 giây ở Groq. Đã tăng chỉ dẫn giọng trò chuyện trong chính schema từng trường để tránh phần JSON ép giọng định nghĩa. Sửa thêm việc chuyển khoảng số như 3–5 thành “3 đến 5”, thay vì “3, 5”.
