# Ta Văn Rót V2

Bản mới độc lập, phát triển trực tiếp từ `3D.html` người dùng cung cấp. Giữ sân khấu, thiết kế mặt lưng, chất liệu, ánh sáng, bộ điều khiển chuyển động và âm thanh của bản 3D. Web cũ và bản sao lưu vẫn nằm ngoài thư mục này.

## Chạy trên máy

Tại thư mục gốc của dự án:

```powershell
node tarot-v2/serve.cjs
```

Mở [bản xem thử](http://127.0.0.1:4182/?preview=1). Lời giải, tâm sự và đánh giá trong chế độ này được mô phỏng; không gọi AI, lấy IP hay ghi Google Sheets. Có thông báo rõ trong phần lời giải.

[Chế độ kết nối thật](http://127.0.0.1:4182/) dùng Apps Script mới trong `js/sheets-config.js`. Backend ưu tiên **Intern InkStone → Groq → Gemini**. Đã xác nhận máy chủ nhận `deepseek-v4-flash-0731`; lượt đọc thật thành công qua Groq, không ghi Sheet. Nhật ký kết nối do chủ trang cung cấp: Intern HTTP 401, Groq HTTP 200, Gemini HTTP 400. Cần sửa khóa Intern/Gemini trong Script Properties để bật đủ chuỗi dự phòng; việc đã nhập khóa không có nghĩa khóa hợp lệ. Xem [hướng dẫn API](apps-script/SETUP.md).

GitHub Pages xuất bản thư mục này tại [tavanrot.online](https://tavanrot.online/) bằng workflow ở thư mục gốc. `tools/build-pages.cjs` chỉ đóng gói HTML, CSS, JavaScript giao diện và tài nguyên; không đưa backend, thử nghiệm, bản sao lưu hay cấu hình khóa lên website. Các tài nguyên mã có mã phiên bản theo commit.

Máy chủ chỉ nghe tại máy đang chạy. Có thể đặt biến môi trường `PORT` nếu cần đổi cổng. Để chuyển sang máy khác, sao chép nguyên thư mục `tarot-v2` rồi chạy `node serve.cjs`; không cần thư mục web cũ. Cần trình duyệt hỗ trợ WebGL.

## Đã hoàn thiện trong bản xem thử

- Intro khoảng 6 giây: ba lá lần lượt trồi lên, xoay theo quỹ đạo có dải sáng, chớp nhũ vàng, tụ về đội hình rồi hạ chiều sâu; giao diện và thương hiệu chỉ hiện khi hoàn tất. Mỗi lá giữ lớp chiều sâu riêng khi xoay, tránh xuyên nhau. Bỏ qua vẫn chuyển mềm về bố cục chính.
- Giữ để xáo, chuyển tốc độ và ánh sáng theo thời gian giữ; lời nhắn nhỏ thay phần trăm.
- Bộ 78 lá được trộn thật, có xuôi/ngược. Vuốt, kéo, nút, bàn phím và con lăn nối vòng liên tục cả hai chiều; không có điểm chặn đầu/cuối. Thanh trượt chuyển nhanh tới vị trí gần nhất trong vòng. Lá đã rút bị loại khỏi vòng, các lá còn lại khép khoảng trống mềm, không trùng danh tính.
- Lá được chọn bay vào đúng ô nhận, đủ số thì cùng bay lên; lật từng lá, mở tất cả, chạm để ngắm gần.
- Bốn cách trải: thời gian, một lá, thân/tâm/trí, gỡ rối bốn lá.
- Tùy chỉnh màu vàng, mở/đóng có chuyển động; tên, ngày sinh hợp lệ, cung hoàng đạo và bốn tông giọng. Nhớ thông tin trên cùng trình duyệt, có nút quên; không đồng bộ giữa thiết bị.
- Lời giải theo từng lá, kết luận và gợi ý hành động; có thử lại khi thiếu nội dung. Tâm sự giữ bối cảnh trải bài, mời ủng hộ một lần sau lượt thứ ba.
- Đánh giá, ghi chú, góp ý; phần ủng hộ có chia sẻ Rót, chuyển đổi đơn hàng và QR mở khi cần. Bảng người ủng hộ dùng kết nối cũ ở chế độ thật.
- Âm thanh tự bật sau lần chạm hoặc nhấn phím đầu tiên. Hệ số âm tổng tăng từ 1,65 lên 3,2, tăng thêm tiếng giấy và tiếng bấm, giữ nén đỉnh để tiếng không chói. Có đọc thành tiếng khi trình duyệt hỗ trợ và tôn trọng tùy chọn giảm chuyển động của hệ điều hành.
- Bỏ hai nút âm thanh/cảm biến ở góc và nút rung trong Tùy chỉnh thêm. Phản hồi điện thoại tự bật khi tương tác lần đầu; trình duyệt có thể yêu cầu quyền cảm biến một lần. Nếu bị từ chối hoặc không hỗ trợ, chạm/vuốt vẫn hoạt động. Cảm biến chỉ điều khiển ánh sáng và độ nghiêng, không ảnh hưởng chọn lá. Rung ngắn khi bấm giao diện, lướt, rút, đáp ô và mở bài; khi xáo có nhịp nghỉ.
- Nút đóng dùng SVG căn giữa. Cửa sổ lời giải/ủng hộ mở và đóng khoảng 0,8 giây, lớp nền tối/mờ chuyển trong 0,9 giây, dùng chung khi mở cửa sổ lồng nhau.
- Tắt lớp tô xanh mặc định khi chạm trên điện thoại và viền focus của thao tác con trỏ; vẫn giữ viền vàng khi dùng bàn phím.

Ba tranh Moon, Star, Sun giữ bản vẽ procedural của `3D.html`. Những lá còn lại dùng ảnh Rider–Waite sẵn có, đặt trong khung chất liệu của bản 3D. Đây chưa phải 78 tranh vẽ mới cùng phong cách procedural.

Khử răng cưa WebGL, lọc texture theo góc nhìn, giới hạn số điểm ảnh và giảm chất lượng tự động khi máy chậm. Chỉ vẽ các lá cần nhìn thấy, tải mặt trước khi cần và giữ bộ nhớ texture trong giới hạn khi trải lại. Độ mượt thực tế còn phụ thuộc GPU; không cam kết FPS trên mọi máy.

Việc tạo mặt bài được chia thành các bước sau nhịp vẽ, tránh làm lúc lá đang bay hoặc lật. Ảnh thu nhỏ mã hóa bằng `toBlob` bất đồng bộ; các texture và shader của hai lớp vẽ được chuẩn bị trước. Không đổi kích thước bộ đệm GPU trong lúc chọn, bay hoặc mở bài. Giữ nguyên chất liệu, ánh sáng, hạt và các lớp hiệu ứng.

Đã tối ưu thêm việc gom các mặt lưng và hạt mở bài vào cùng lượt dựng, lưu kích thước khung, chuyển tên lá bằng transform, dùng lại bộ nhớ và gom cập nhật khi đổi màn hình. Các mesh gốc vẫn nhận thao tác chạm. Lượt dựng lúc xáo giảm từ 141/109 xuống 16 trên hai khung đo, giữ nguyên chất liệu, hình học, số hạt và độ phân giải. Xem [phép đo và đối chiếu hình ảnh](PERFORMANCE.md).

Nghiêng máy yêu cầu [ngữ cảnh bảo mật và đôi khi quyền cảm biến](https://developer.mozilla.org/en-US/docs/Web/API/DeviceOrientationEvent/requestPermission_static). [Rung phụ thuộc trình duyệt và phần cứng](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/vibrate). Đã kiểm tra kích hoạt bằng lần chạm đầu tiên, quyền cấp/từ chối, hiệu chỉnh, đổi hướng màn hình và giới hạn nhịp bằng mô phỏng. Đã đo tín hiệu Web Audio thật trong Chromium sau thao tác chạm; cảm giác âm thanh, rung và cảm biến trên phần cứng điện thoại vẫn cần đối chiếu trực tiếp.

## Kiểm tra

Đã kiểm tra trên Chromium tại 1440×900, 390×844 (đổi sang 360×780 khi lá đang bay), 320×568 và 844×390. Cả bốn cách trải đều qua luồng nhập → xáo → vuốt → nhận lá → mở → ngắm gần → lời giải → tâm sự → đánh giá → trải lại. Không có lỗi JavaScript hoặc yêu cầu ra ngoài trong bản xem thử. Sai lệch tâm lá so với tâm ô nhận dưới một điểm ảnh trong các lượt đo.

Kiểm tra phản hồi mô phỏng cho kết nối thật xác nhận: lời giải thiếu có thể thử lại mà giữ các lá; tâm sự mang đủ bối cảnh; đánh giá cập nhật đúng thời gian/IP của lượt đã lưu; kết quả trả về trễ không ghi đè lượt mới. Backend có kiểm tra thứ tự dự phòng, 401/403/429/500, thời gian nghỉ riêng từng dịch vụ, cache và không lộ khóa. Không gọi Intern/Groq/Gemini thật.

Để chạy lại kiểm tra, khởi động máy chủ trước. Các bài kiểm tra dùng `puppeteer` đã có trong môi trường phát triển và Chrome; có thể đặt `CHROME_PATH` cho bài kiểm tra giao diện.

```powershell
node tarot-v2/tests/browser.cjs
node tarot-v2/tests/services-browser.cjs
node --test tarot-v2/tests/ai.test.cjs tarot-v2/tests/providers.test.cjs
node --test tarot-v2/tests/mobile.test.cjs
node --test tarot-v2/tests/carousel.test.cjs tarot-v2/tests/pages.test.cjs
node tarot-v2/tests/carousel-browser.cjs
node tarot-v2/tests/feedback-browser.cjs
node tarot-v2/tests/render-parity-browser.cjs
node tarot-v2/tests/performance-browser.cjs
```

Báo cáo JSON và ảnh chụp nằm tại `artifacts/`. Các ảnh chụp không được đưa vào Git theo mặc định.

Kiểm tra vòng lặp riêng ở 1440, 390 và 320 pixel: qua ranh giới hai chiều, quay trọn vòng rồi chạm trực tiếp lá, rút một lá, quay ngược ba vòng và chạm lá tiếp theo; không trùng lá hoặc chọn tự động. Bài kiểm tra chạm trực tiếp tái hiện lỗi bộ lọc raycast còn dùng chỉ số tuyến tính; đã đổi sang khoảng cách trong vòng bài như phần hiển thị. Kiểm tra thao tác chạm không hiện viền xanh, bàn phím vẫn có viền nhận biết. Các thao tác này dùng dữ liệu mô phỏng, không gọi AI/Sheet. `tests/check-connection.cjs` là lệnh thử thật theo yêu cầu, không nằm trong CI; chỉ in nhà cung cấp/model/trạng thái, không in khóa hoặc nội dung lời giải.

## Mã nguồn

`experience.css` và `js/engine.js` là nền 3D đã thích nghi. `app.css`, `js/app.js` và `index.html` bổ sung giao diện và điều phối chức năng. Các module dữ liệu, hồ sơ, xử lý lời giải và giao thức AI/Sheets được sao chép riêng, không phụ thuộc đường dẫn web cũ. Phông chữ và Three.js phục vụ từ tệp trong thư mục, không cần CDN để dựng hình.
