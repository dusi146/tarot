# Sự cố hạn mức — 15/10/2026

Đã kiểm tra trực tiếp tab 15-10-2026 của Sheet theo yêu cầu chủ trang. Vùng A495:R528, sau triển khai Apps Script 24: 34 lượt, 16 thành công và 18 thất bại. Không sao chép tên, câu hỏi, IP hoặc lời giải người dùng vào báo cáo.

- Q501, Q504, Q508 ghi Groq HTTP 429 thực tế. 24 lượt trong vùng trên ghi Groq RATE_LIMIT không có HTTP: đây là các lượt bị tạm bỏ qua, không chứng minh Groq được gọi lại và trả thêm lỗi.
- Q495 ghi Groq HTTP 400; log cũ không giữ phân loại nên chưa xác định nguyên nhân riêng của lượt đó.
- Nhiều lượt thất bại gồm Groq hết hạn mức, Gemini 429/503 và Intern timeout. Bản trước gom tình huống này thành PROVIDER_ERROR chung, không giúp người xem biết thời gian thử lại.

## Xác minh trực tiếp với Groq

Kiểm tra bằng yêu cầu rất ngắn trả HTTP 200; quota header cho biết TPM=8.000 và RPD=1.000. Điều này không chứng minh một trải bài đủ dài được chấp nhận.

Lúc 10:51, trải bốn lá giả lập trả HTTP 429 với code rate_limit_exceeded, loại **tokens per day (TPD)**: Limit=200.000, Used=198.301, Requested=3.332, Retry-After=706 giây. Không in thông báo lỗi thô, ID tài khoản, khóa hoặc nội dung lời giải. Khóa hợp lệ; nguyên nhân cụ thể là ngân sách token không đủ cho yêu cầu này. Hạn mức có thể phục hồi dần; không suy ra phải chờ tới nửa đêm từ tên “per day”.

[Tài liệu Groq](https://console.groq.com/docs/rate-limits) phân biệt RPM/RPD/TPM/TPD, hạn mức cấp tổ chức và Retry-After. Đây là hạn mức phía dịch vụ; chỉnh mã không thể nâng hạn mức tài khoản.

## Thay đổi

- Giữ Groq → Gemini → Intern. Bỏ giới hạn 6 lượt/phút tự đặt; chỉ HTTP 429 thực tế tạo trạng thái hết hạn mức.
- Cooldown theo nhà cung cấp và model. Lượt bị bỏ qua không ghi đè/gia hạn thời điểm được thử lại. Dùng namespace mới để loại bỏ trạng thái từ bộ đếm cũ.
- Ghi nguồn upstream/cooldown, mã HTTP gốc, loại TPM/TPD/RPM/RPD nếu nhận diện được và số giây chờ. Frontend hiển thị SKIP cho lượt không gọi dịch vụ; metadata được lọc bằng danh sách cho phép, không chứa lỗi thô.
- HTTP 400/404/413 không khóa dịch vụ cho người dùng khác. Chỉ khi Groq trả lỗi sinh JSON/schema được nhận diện rõ mới thử sửa một lần bằng JSON mode; vẫn kiểm tra đủ các phần của lời giải trước khi chấp nhận.
- Khi mọi dịch vụ đều đang tạm nghỉ, trả AI_UNAVAILABLE với thời gian sớm nhất có thể thử lại, trừ cả thời gian đã dùng ở nhà cung cấp sau. Giao diện giữ bài, báo thời gian chờ và chặn yêu cầu lặp trong thời gian đó.
- Giữ Retry-After thực tế; hỗ trợ số thập phân, HTTP-date và RetryInfo của Google thay vì luôn mặc định 60 giây.

98/98 kiểm thử liên quan đạt. Có tái hiện hơn sáu lượt/phút, HTTP 429 theo ngày, nhiều lượt SKIP không gia hạn cooldown, lỗi 400 theo từng yêu cầu, sửa JSON có giới hạn và tình huống hai API hết hạn mức + Intern timeout. Không gọi API thật trong các kiểm thử này. Bản máy chủ 24 được lưu trong backups/prompt-fallback-20261015/Code.server-v24.gs.

Đã triển khai Apps Script **25** lúc 11:00 trên cùng địa chỉ /exec. Kiểm tra thật lúc 11:01 xác nhận fallbackVersion=4, quotaPolicy=upstream. Kết quả **AI_UNAVAILABLE**, Groq TPD, Gemini RPD và Intern timeout; không coi đây là kiểm tra sinh lời giải thành công. Giao diện thêm thời gian đếm ngược ở nút thử lại, không gửi/ghi thêm lượt thất bại khi đang chờ trên cùng trình duyệt. Không ghi dữ liệu kiểm tra vào Sheet.

Theo yêu cầu tiếp theo, đã bổ sung Xkiro / Mistral Large 4 làm API đầu tiên trong Apps Script **26**. Trải bốn lá và câu tâm sự giả lập đều thành công qua Xkiro sau triển khai; xem [kết quả mới nhất](AI_UPDATE.md). Các hạn mức Groq/Gemini vẫn được tôn trọng khi hai dịch vụ này được dùng làm dự phòng. Mẫu JSON rõ bốn khóa cũng đã giúp một lượt Intern trả đủ nội dung; không suy ra Intern ổn định trên mọi lượt từ một phép thử.
