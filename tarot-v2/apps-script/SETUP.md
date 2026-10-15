# Bật Intern InkStone → Groq → Gemini

Ngày 15/10/2026, đã cập nhật bản Apps Script đang dùng lên **phiên bản 23** với Prompt 6 và giới hạn chờ riêng từng API. Nguồn tương ứng nằm trong **Code.gs ở cùng thư mục này**; địa chỉ /exec giữ nguyên. Xem [phân tích nhật ký và kiểm tra](../AI_UPDATE.md). Bản xem thử tại `http://127.0.0.1:4182/?preview=1` vẫn dùng dữ liệu mô phỏng, không tiêu token hay ghi Sheet.

## 1. Mở dự án Apps Script cũ

Mở [Google Sheet của Rót](https://docs.google.com/spreadsheets/d/1STZqTjCDzioE_ijRzKnkDyQO6XzxLW-SJm3fJATZniA/edit) → **Tiện ích mở rộng → Apps Script**.

Trong **Cài đặt dự án** (biểu tượng bánh răng ở thanh trái), tìm **Thuộc tính tập lệnh / Script properties**, thêm:

| Thuộc tính | Giá trị cần đặt |
| --- | --- |
| `INTERN_AI_API_KEY` | Khóa Intern của bạn, dạng `sk-…` |
| `GROQ_API_KEY` | Giữ nguyên khóa Groq đang có |
| `GEMINI_API_KEY` | Khóa Gemini API của bạn |

Lưu thuộc tính. Không dán các khóa này vào HTML, JavaScript phía web, Code.gs, GitHub hay tin nhắn chat. Script Properties là nơi lưu cấu hình máy chủ trong Apps Script, thay cho biến môi trường của Node/Express.

Nếu một khóa để trống, hệ thống bỏ qua nhà cung cấp đó. Muốn đủ ba lớp dự phòng thì cần đủ ba khóa hợp lệ. Không cần gửi khóa cho Codex.

## 2. Chọn model nếu cần

Các thuộc tính dưới đây là tùy chọn. Chỉ thêm khi model trong tài khoản khác mặc định:

| Thuộc tính | Mặc định |
| --- | --- |
| `INTERN_AI_MODEL` | `deepseek-v4-flash-0731` đã đối chiếu với tài khoản của bạn |
| `GROQ_MODEL` | `openai/gpt-oss-120b` như bản cũ |
| `GEMINI_MODEL` | `gemini-2.5-flash` như kết nối trước đây |

Đối chiếu **Model ID** trong [bảng điều khiển Intern chính thức](https://discovery.intern-ai.org.cn/token-plan/home). Địa chỉ OpenAI-compatible đã xác minh là `https://discovery-api.intern-ai.org.cn/v1`. Danh sách model, token còn lại, RPM và TPM thực tế lấy theo tài khoản; chưa xác minh được mức 500 triệu token hay 50 RPM cho tài khoản của bạn. Không cần nhập context 1M: website chỉ gửi bối cảnh cần cho trải bài và cuộc tâm sự.

[Google hiện ghi nhận Gemini 2.5 Flash vẫn phục vụ người dùng đã dùng trước đây](https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash). Nếu tài khoản không gọi được, đặt `GEMINI_MODEL` thành một model hỗ trợ JSON có trong AI Studio của bạn.

## 3. Cập nhật mã khi sẵn sàng bật API

Nếu đã triển khai mã trước đây với model `0711`, chỉ cần thêm hoặc sửa Script Property **INTERN_AI_MODEL = deepseek-v4-flash-0731** rồi lưu. Thuộc tính được đọc ở mỗi lượt gọi; không cần triển khai lại để đổi model.

1. Mở `tarot-v2/apps-script/Code.gs` trên máy, chép toàn bộ.
2. Trong trình soạn thảo Apps Script, thay toàn bộ nội dung **Mã.gs / Code.gs** bằng mã mới rồi **Lưu**. Không tạo thêm một file có các hàm `doPost`/`doGet` trùng với file cũ.
3. Ở danh sách chọn hàm cạnh nút **Chạy**, chọn **checkAIConnections** rồi **Chạy**. Cấp quyền Google nếu được yêu cầu.
4. Nhật ký hiển thị HTTP của từng dịch vụ và model đang chọn, không in khóa. HTTP 200 ở /models chưa xác nhận sinh lời giải hoạt động. Chọn **checkAIGeneration** để thử lời giải bằng dữ liệu mẫu trên cả ba dịch vụ; hàm không ghi Sheet hoặc in khóa/nội dung lời giải.
5. Chọn **Triển khai → Quản lý các bản triển khai → bút chì → Phiên bản mới → Triển khai**. Giữ quyền thực thi bằng tài khoản của bạn và quyền truy cập web app như bản cũ.

Ưu tiên cập nhật bản triển khai đang dùng để giữ nguyên link `/exec`. Nếu tạo bản triển khai mới, thay `endpoint` trong `tarot-v2/js/sheets-config.js` bằng link mới. Đừng dùng link phản hồi tạm `script.googleusercontent.com` làm endpoint.

## 4. Thử kết nối thật

Mở `http://127.0.0.1:4182/` **không có `?preview=1`**, nhập câu hỏi rồi chọn/mở bài và nhấn đọc lời giải. Lượt này sẽ dùng API thật và lưu vào Sheet cũ. Cột **Người giải** ghi nhà cung cấp/model thực sự trả lời. Phản hồi lỗi không được trình bày thành lời giải hoàn chỉnh.

Kiểm thử tự động dùng phản hồi mô phỏng. Đã chạy thêm thử sinh lời giải thật ngày 15/10/2026: Groq thành công; Gemini thành công nhưng chậm; Intern vẫn có phản hồi thiếu. Muốn quay lại duyệt hình ảnh mà không gửi dữ liệu ra ngoài, dùng lại `?preview=1`.

## Cách dự phòng hoạt động

Mỗi lượt ưu tiên **Groq → Gemini → Intern**, theo yêu cầu chủ trang ngày 15/10/2026. Cấu hình timeoutSeconds lần lượt 25/35/25 giây; đây là tham số gửi tới Apps Script, không cam kết thời gian thực tế tuyệt đối (một phép thử Gemini vẫn mất 122 giây). HTTP 401/403, 429, lỗi máy chủ, kết nối hỏng, timeout hoặc lời giải thiếu đều có thể chuyển sang nhà cung cấp tiếp theo. Chỉ nhà cung cấp lỗi bị tạm nghỉ; lỗi timeout tạm nghỉ 120 giây. Một API chạm hạn mức không khóa toàn bộ chuỗi. Khi cả chuỗi hết hạn mức, giao diện thông báo thời gian chờ. Nếu cả chuỗi sai khóa, giao diện báo cần kiểm tra cấu hình.

Bản dự phòng 4 bỏ mức 6 lượt/phút tự đặt. HTTP 429 từ dịch vụ mới tạo cooldown hạn mức; cooldown theo model và không được gia hạn lại bởi lượt SKIP. Cột Người giải phân biệt HTTP thật với SKIP, loại TPM/TPD/RPM/RPD nếu nhận diện được và thời gian chờ. Khi các API chính hết hạn mức còn API cuối timeout, giao diện giữ bài và báo thời gian thử lại. Mã không thể tăng ngân sách tài khoản; xem [kết quả kiểm tra quota thật](../QUOTA_INCIDENT.md).

Nếu `checkAIConnections` báo Intern HTTP 401 thì kết nối đang bị từ chối xác thực, dù tên model đã đúng. Đặt khóa lấy từ tài khoản Intern vào `INTERN_AI_API_KEY`; khóa lấy từ Google AI Studio vào `GEMINI_API_KEY`. HTTP 400 của Gemini chưa xác định riêng được nguyên nhân từ mã trạng thái. Lưu thuộc tính không cần triển khai lại. Kết nối bị từ chối xác thực tạm nghỉ 300 giây; đợi hết thời gian này rồi thử một lượt đọc để xác nhận nhà cung cấp thực sự được dùng. Không gửi ảnh có giá trị khóa vào chat.

Prompt tiếng Việt, bốn tông giọng, các lá xuôi/ngược, vị trí, lời giải trước và lịch sử gần nhất giữ nguyên khi đổi nhà cung cấp. Backend tự dựng prompt và kiểm tra các lá, không nhận API key, URL tùy ý hay system prompt từ trình duyệt. Chỉ lưu cache lời giải đủ nội dung trong năm phút để tránh gọi lại khi mở cùng một lượt.

Apps Script dùng [ContentService/TextOutput](https://developers.google.com/apps-script/reference/content/text-output), không có giao diện đẩy từng chunk SSE tới trình duyệt. Vì vậy bản này dùng JSON trả trọn gói với trạng thái đang trả lời; **không có streaming SSE thật**. Nếu sau này cần SSE, cần chuyển phần AI sang một backend hỗ trợ streaming; không bật `stream: true` trên Apps Script rồi giả nhận từng token. Chat hiện hỗ trợ đoạn văn, in đậm/nghiêng, danh sách, liên kết HTTP(S), code block và tô màu mã JavaScript/TypeScript/Python/JSON; không thực thi HTML từ AI.

Để dựng lại Code.gs sau khi sửa prompt hoặc backend:

```powershell
node tarot-v2/apps-script/build.cjs
```
