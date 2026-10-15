# Lời giải và dự phòng API — 15/10/2026

**Bổ sung ngắm gần và ủng hộ:** Lá được phóng lớn hơn trên máy tính từ 1024×600, theo vùng còn trống và tối đa 760px chiều cao thiết kế; căn camera theo vị trí thật của lá, tạm ẩn hướng dẫn để tránh che bài. Ba kiểm tra riêng đạt, gồm giới hạn điện thoại giữ nguyên và chiếu các góc lá nghiêng/ngược qua camera thật của Three.js tại 1024×600, 1280×720, 1440×900 và 1920×1080. Nút Nghe đọc đã thay bằng Ủng hộ Rót; QR hiện sẵn ở đầu cửa sổ, mở lại trở về đầu. Không gọi sinh lời giải hoặc sửa máy chủ cho các thay đổi giao diện này.

**Đọc bài nhẹ hơn và rõ hơn:** Khi mở cửa sổ lời giải/ủng hộ, dừng vòng vẽ của cả hai lớp WebGL và giữ nguyên hình. Resize/font thay đổi chỉ đánh thức một khung cần thiết; đóng cửa sổ, trở lại tab hoặc phục hồi WebGL đồng bộ lại thời gian, không tua bù chuyển động. Năm kiểm tra riêng đạt: dừng cả hai renderer, tiếp tục sau thời gian đọc dài, cửa sổ chồng nhau, resize, tab ẩn/hiện và mất/phục hồi context. Đây là xác minh hành vi vòng vẽ, chưa đo mức giảm nhiệt/pin trên điện thoại thật.

Chữ nội dung và tâm sự trên điện thoại tăng từ 12–13px lên 15px, ô nhập tâm sự 16px, tiêu đề lời giải 27px và tiêu đề mục nhỏ hơn. Lời mời tâm sự đổi thành “Mình cùng gỡ thêm nhé” và hai câu gần gũi theo nội dung chủ trang gửi. Bỏ dòng “Đã lưu trải bài” và khoảng trống trạng thái khi lưu thành công; thao tác lưu/nhật ký vẫn chạy. Chỉ kiểm tra các phần thay đổi, không gọi lại AI hoặc sửa Apps Script.

**Prompt 7 và phần tiết lộ:** Góc nhìn chung được yêu cầu khoảng 100–140 từ, nối các lá, điểm thuận/vướng và dấu hiệu đối chiếu. Thay Một bước nhỏ cho bạn bằng **Phán đoán của Rót**: một sự việc hoặc chuyển biến cụ thể có thể quan sát, gắn với lá/vị trí/chiều bài, khoảng 50–80 từ trước câu kết. Chỉ dẫn phân biệt dự đoán với lời khuyên “bạn nên…” và không dùng cảm giác yên tâm làm tín hiệu kiểm chứng.

Nội dung phán đoán được làm mờ, chạm hoặc nhấn Enter/Space mới hiện; vùng chữ giữ nguyên chiều cao. Cập nhật theo mẫu Threads của chủ trang: blur 5px/opacity 0,25, hạt vàng champagne phủ trực tiếp chữ, chạm tản hạt từ điểm chạm, hiện chữ trong 0,35 giây; bỏ nút nổi che đoạn. Mật độ gốc 60%, giới hạn 3.200 hạt và DPR 2, vẽ tối đa 30 lần/giây, không đọc lại computed style mỗi khung. Hạt dừng ngoài vùng nhìn, khi đóng cửa sổ hoặc ẩn tab; khi mở xong thì giải phóng canvas/listener. Giảm chuyển động dùng mặt hạt tĩnh và mở tức thì. Chỉ chạy 8 kiểm tra liên quan phần tiết lộ cho cập nhật này; không gọi lại AI hoặc triển khai lại Apps Script.

Trước khi mở, nội dung không tham gia điều hướng/đọc hỗ trợ. Kết đúng một lần bằng “Đây chỉ là dự đoán dựa trên năng lượng của bạn với trải bài này.” Chữ lời giải và tên lá hiện nhẹ trong khoảng 0,95 giây, giảm chuyển động bỏ cả độ trễ so le.

Giao thức readingFormat=3 giữ khóa JSON advice để tương thích gateway. Tab cũ nhận tiêu đề cũ, tab mới nhận Phán đoán của Rót; cache tách hai dạng, tránh đổi tiêu đề làm lỗi lời giải thiếu. 137 kiểm thử liên quan đạt, gồm tiết lộ an toàn, câu kết không che giấu phần thiếu, tương thích cache/tab và chuỗi năm API. Bản nguồn máy chủ 27/28 đã được lưu riêng.

Đã triển khai **Apps Script 29** lúc 13:15 ngày 15/10/2026, cùng địa chỉ /exec. Health trả promptVersion=7, readingFormat=3 và giữ fallbackVersion=6. Lượt kiểm tra giả lập sau triển khai thành công qua Xkiro: upstream 10.707 ms, tổng 12.824 ms, 1.973 ký tự; Góc nhìn chung 100 từ, phán đoán 78 từ trước câu kết. Phán đoán đã dự báo một phản hồi/trao đổi cụ thể thay cho lời khuyên “nên chờ”. Không ghi lượt API kiểm tra này vào Sheet; metadata ở artifacts/live-connection.json. Đây là kiểm tra một mẫu, không bảo đảm mọi lần sinh sẽ bám hoàn toàn số từ hoặc giọng văn.

**Thứ tự API hiện tại:** **Xkiro → Intern mới (intern2) → Intern cũ (intern) → Gemini → Groq**. Khóa mới được lưu riêng trong INTERN_AI_API_KEY_2; khóa cũ giữ nguyên. Hai slot dùng cooldown/model override riêng, nhật ký giữ đủ năm lượt. Các kiểm thử gồm từng nhánh chuyển tiếp, lỗi của một khóa không chặn khóa còn lại, tâm sự trên từng route, đầu ra đủ bốn lá, quota và không lộ khóa.

Xác minh khóa Intern mới bằng POST sinh văn bản ngắn: HTTP 200, có câu trả lời và finish_reason=stop trong 2.040 ms. Hai phép thử lời giải đầy đủ trước đó timeout ở 24.505 ms và 34.502 ms; vì vậy không khẳng định model sinh lời giải luôn hoạt động tốt chỉ từ kiểm tra ngắn. Ngưỡng chờ gửi cho mỗi slot Intern hiện là 35 giây; khi lỗi, chuỗi chuyển tiếp như đã kiểm thử. Không đưa khóa vào mã nguồn, báo cáo hoặc Sheet.

Đã triển khai **Apps Script 27** lúc 11:32 ngày 15/10/2026 trên cùng địa chỉ /exec. Health trả fallbackVersion=6 và đúng thứ tự xkiro, intern2, intern, gemini, groq, cả năm slot đã có cấu hình. Lượt xác minh sau triển khai lúc 11:33 thành công qua Xkiro, 1.010 ký tự, upstream 6.037 ms, không ghi Sheet. Kết quả metadata nằm trong artifacts/live-connection.json; nguồn máy chủ 26 được sao lưu để đối chiếu.

**Bản 26:** theo yêu cầu trước đó, thêm **Xkiro / mistralai/mistral-large-4-0 → Groq → Gemini → Intern**. Khóa được lưu trực tiếp vào Script Properties, không có trong mã nguồn hoặc phía web. Xkiro đã sinh lời giải đầy đủ trong phép thử thật khoảng 5,6 giây. Mẫu JSON bổ sung cũng giúp Intern trả đủ bốn phần trong một phép thử 20,8 giây. Xem [sự cố hạn mức](QUOTA_INCIDENT.md); phần dưới ghi lịch sử các lần cập nhật trước.

Đã triển khai **Apps Script 26** lúc 11:17 ngày 15/10/2026, cùng địa chỉ /exec, health fallbackVersion=5. Xác minh sau triển khai bằng dữ liệu giả lập: trải bốn lá thành công qua Xkiro, 1.854 ký tự, thời gian upstream 9.445 ms (toàn lượt 11.140 ms); tâm sự tiếp theo cũng qua Xkiro, 853 ký tự, upstream 5.539 ms (toàn lượt 7.719 ms). Không ghi các lượt kiểm tra vào Sheet. Bản nguồn máy chủ 25 được lưu riêng để đối chiếu/khôi phục.

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
