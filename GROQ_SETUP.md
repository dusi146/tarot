# Bật Groq và giữ kín API key

Web gọi Google Apps Script, Apps Script gọi Groq. Model đang dùng là `openai/gpt-oss-120b`. Trình duyệt chỉ gửi câu hỏi, danh tính lá bài và lịch sử tâm sự; không nhận API key. Các prompt theo tông giọng và danh mục lá được dựng lại trên máy chủ.

## Cấu hình trong Apps Script của Sheet cũ

1. Mở [Sheet cũ](https://docs.google.com/spreadsheets/d/1STZqTjCDzioE_ijRzKnkDyQO6XzxLW-SJm3fJATZniA/edit), chọn **Tiện ích mở rộng → Apps Script**. Sao chép mã cũ ra chỗ riêng để dự phòng.
2. Mở `apps-script/Code.gs` trong repo này, sao chép toàn bộ vào `Code.gs` trong trình sửa Apps Script, thay phần mã cũ rồi lưu. File này đã gồm phần ghi Sheet 18 cột, đánh giá, tâm sự và TopDonate. Không thêm một `doPost` thứ hai. Dùng file `Code.gs` đầy đủ, không chỉ `backend.js`.
3. Vào **Cài đặt dự án / Project Settings → Thuộc tính tập lệnh / Script properties → Add script property**. Tên thuộc tính: `GROQ_API_KEY`. Giá trị: khóa mới lấy từ [Groq API Keys](https://console.groq.com/keys). Chọn **Save script properties**. Không dán khóa vào mã nguồn.
4. Quay lại trình sửa, chọn hàm **checkGroqConnection** rồi **Run**. Chấp nhận quyền truy cập cần thiết bằng tài khoản sở hữu Sheet. Khi thành công, nhật ký chỉ báo tên model, không in khóa.
5. Chọn **Triển khai → Quản lý các bản triển khai → biểu tượng bút chì** ở Web app đang dùng. Chọn **Phiên bản mới / New version**, thực thi với tài khoản của bạn và quyền truy cập **Anyone**, rồi **Deploy**. Chỉ lưu mã chưa cập nhật bản `/exec`; cần bước triển khai này. Cập nhật bản triển khai cũ sẽ giữ nguyên URL nên không phải sửa web.
6. Mở URL Web app `/exec?action=ai_health`. Phải có `"service":"tarot-groq"`, `"version":1`, `"configured":true`, `"readingFormat":2`. Endpoint kiểm tra chỉ cho biết trạng thái và model, không trả khóa. Nếu chỉ có `data` của TopDonate thì đang chạy bản GS cũ; nếu thiếu `readingFormat:2` thì bản Groq chưa có cấu trúc lời giải mới; nếu `configured:false` thì thiếu thuộc tính khóa.
7. Tải lại web và thử một trải bài. Sheet vẫn ghi lời giải, trạng thái và người giải `Groq / openai/gpt-oss-120b`.

Nếu bạn tạo **bản triển khai mới** thay vì sửa bản cũ, URL `/exec` đổi. Khi đó thay `endpoint` trong `sheets-config.js` bằng URL mới và đẩy lại GitHub. URL là công khai, không phải API key.

Tài liệu chính thức: [Script properties](https://developers.google.com/apps-script/guides/properties#manage_script_properties_manually), [triển khai Web app](https://developers.google.com/apps-script/guides/web), [Groq API](https://console.groq.com/docs/api-reference).

## Giấu khóa trong Git và GitHub

- `.gitignore` đã loại `gemini_config.json`, `groq_config.json`, `.env`, `.env.*` và `.clasp.json` khỏi các lần thêm file mới. Nó không xóa khóa từng được commit trước đây.
- Với cách Apps Script này, chỉ lưu khóa ở **Script properties**. Không cần đặt khóa trong GitHub để web hoạt động. Người có quyền sửa dự án Apps Script vẫn có thể xem thuộc tính này; đừng chia sẻ quyền sửa dự án cho người không tin cậy.
- Nếu cần lưu một khóa để **workflow phía máy chủ** sử dụng: vào **GitHub repo → Settings → Secrets and variables → Actions → New repository secret**, nhập tên `GROQ_API_KEY` và giá trị. Tạo Secret không tự nối khóa với Apps Script. Không ghi khóa vào mục Variables hay file JS.
- Cách Gemini cũ lấy GitHub Secret rồi chèn vào `script.js` chỉ giấu trong repo, vẫn làm khóa xuất hiện trong mã web công khai. Workflow đã bỏ bước chèn khóa này. Một khóa OpenRouter cũ mã hóa base64 trong file giao diện dự phòng cũng đã được gỡ khỏi bản hiện tại; base64 không bảo mật và Git vẫn có lịch sử cũ.
- Khóa đã xuất hiện trong chat hoặc từng nằm trên web cần được thu hồi tại nhà cung cấp và thay mới. Không gửi khóa mới vào chat hoặc ghi nó trong ảnh chụp.

## Hạn mức và kiểm tra

Khi cập nhật lời giải mới: dán lại toàn bộ `apps-script/Code.gs`, lưu và triển khai **phiên bản mới của bản Web app đang dùng** bằng biểu tượng bút chì. Giữ nguyên Script property `GROQ_API_KEY` và URL `/exec`. Prompt chạy trên Apps Script, nên chỉ cập nhật GitHub sẽ chưa đổi được prompt của dịch vụ đang chạy.

Lượt đọc dùng [Structured Outputs của Groq](https://console.groq.com/docs/structured-outputs) với các trường bắt buộc cho từng lá, góc nhìn chung và hành động. Máy chủ chuyển kết quả thành văn bản tiếng Việt theo cấu trúc cố định, kiểm tra nội dung và không lưu cache lời giải rỗng/bị cắt. Góc nhìn chung trả lời thẳng câu hỏi ngay câu đầu, khoảng 3 câu; không kể lại tranh hay nghĩa từng lá. Giao diện kiểm tra thêm trước khi báo thành công và có nút thử lại giữ nguyên các lá đã chọn.

Server xử lý đúng các action AI riêng, không biến yêu cầu AI thành dòng dữ liệu Sheet. Server không cho trình duyệt chọn model hoặc system prompt tùy ý. Lượt đọc giống hệt được dùng lại trong 5 phút; lỗi Groq 429 sẽ đặt thời gian chờ chung theo `Retry-After`, giao diện cũng chặn gọi lại trong lúc chờ. Không tự gọi thử liên tục khi hết quota.

Có giới hạn mềm 6 yêu cầu AI/phút cho toàn bộ web bằng Apps Script Cache + Lock. Cache có thể bị Google thu hồi trước hạn, nên đây không phải hệ thống chống lạm dụng tuyệt đối. Endpoint Web app là công khai; khi đông người, nên chuyển sang backend có xác thực và giới hạn lưu trữ bền vững. Groq và Apps Script đều vẫn có quota, gói miễn phí không bảo đảm hết lỗi 429.

Chạy `node tools/build-apps-script.cjs` khi sửa `tarot-persona.js`, `tarot-data.js` hoặc `apps-script/backend.js`, rồi cập nhật `Code.gs` và triển khai phiên bản GS mới. Kiểm tra bằng `node --test tests/*.test.cjs`.
