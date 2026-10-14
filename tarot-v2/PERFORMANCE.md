# Tối ưu chuyển động, giữ đầy đủ hiệu ứng

Đối chiếu bản trước tại commit `1dfb4f5` với bản tối ưu. Đo bằng Chromium trên cùng máy, cùng luồng thao tác và cùng mức phân giải: khung 1440×900 và 390×844. Toàn bộ lời giải/tâm sự được mô phỏng, không gọi dịch vụ AI hay ghi Google Sheets.

| Phép đo | Trước | Sau |
| --- | ---: | ---: |
| Lượt dựng mỗi khung lúc xáo, màn hình lớn | 141 | 16 |
| Lượt dựng mỗi khung lúc xáo, khung điện thoại | 109 | 16 |
| Lượt dựng trung bình lúc mở bài | khoảng 52 | khoảng 30 |
| Đo vị trí DOM mỗi khung khi vuốt ổn định | 6 | 0 |
| Số lần layout trong lượt rút bốn lá, màn hình lớn | 325 | 15 |
| Số lần layout trong đoạn ngắm bài đã mở | 109–294 | 0 |

Các lượt dựng được đếm tại WebGL; layout lấy từ Chromium Performance. Khung xáo giảm khoảng 85–89% lượt dựng, không phải tuyên bố FPS tăng theo cùng tỷ lệ. Trong lần đo này, p95 vẫn khoảng 17 ms vì trình duyệt đang chạy gần nhịp 60 Hz. Máy thật có GPU, nhiệt độ và tải khác sẽ cho kết quả khác.

## Thay đổi

- Mặt lưng dùng chung hình học và chất liệu được vẽ bằng instancing. Mỗi lá vẫn có đủ vị trí, góc quay, tỷ lệ, nhũ vàng và độ sáng viền riêng. Giữ nguyên các nhóm mặt trước/mặt sau/cạnh vát và toàn bộ đỉnh hình học. Lá được chọn chuyển sang lớp bay như trước; mesh gốc tiếp tục nhận cú chạm và kiểm tra va chạm.
- Tối đa 42 hạt mở bài được gom vào một lượt vẽ. Vị trí, kích thước theo phối cảnh, màu, độ mờ, vận tốc và tuổi thọ của từng hạt giữ nguyên. Dùng lại shader và texture điểm của Three.js; thiết bị có giới hạn kích thước điểm thấp dùng lại các sprite cũ.
- Lưu vị trí khung nhận bài. Chỉ đo lại khi kích thước thay đổi, lúc khung đang trượt vào/ra, khi đổi màn hình hoặc trước lúc rút. Vẫn chiếu lại vào không gian 3D theo máy quay mỗi khung, nên lá đáp đúng ô khi đổi kích thước giữa chuyến bay.
- Tên/vị trí lá đi theo bài bằng transform thay vì thay `left`/`top`. Ổn định chiều rộng chữ theo điểm ảnh để tránh đổi dòng vì sai số nhỏ. Giữ nguyên việc theo dõi bài và hiệu ứng xuất hiện.
- Dùng lại danh sách lá còn lại, bộ nhớ lò xo, quaternion và bộ đệm raycast. Hover được kiểm tra tối đa một lần mỗi khung; thao tác chạm chọn vẫn được xử lý ngay.
- Gộp các sự kiện đổi kích thước thành một lần cập nhật bộ đệm mỗi khung. Giữ nguyên MSAA, mipmap, bộ lọc texture, trần độ phân giải và cơ chế thích nghi hiện có.
- Chuẩn bị shader mới trong màn hình tải. Không đánh dấu biên dịch lại chất liệu khi chỉ đổi texture có cùng cấu trúc. Chỉ dừng animation của chi tiết đã hoàn toàn biến mất, sau khi chuyển mờ kết thúc; bật lại khi chi tiết xuất hiện.

Nền cực quang, vòng thiên văn, sao/bụi, ba lá intro, ánh nhũ, quầng sáng, đường bay, góc nghiêng, tiếng động và rung được giữ lại. Không giảm số lá khi xáo, số hạt hoặc thời gian chuyển động để đạt các số đo trên.

## Kiểm tra hình ảnh và chức năng

`tests/render-parity-browser.cjs` giữ nguyên một khung hình rồi đổi giữa cách vẽ từng mesh và cách gom lượt vẽ. So sánh ở màn hình chính, xáo, chọn, bay và hạt khi lật. Kiểm tra cùng hình học, số hạt và phân giải. Sai lệch trung bình mỗi kênh màu trong các mẫu dưới 0,003 trên thang 0–255; sai khác cục bộ rất nhỏ ở cạnh do phép tính GPU làm tròn theo thứ tự khác.

Đã chạy đối chiếu bằng cả WebGL 2 và WebGL 1/ANGLE. Mẫu hạt mở bài trùng hoặc chỉ lệch tối đa một mức màu; thiết bị thiếu instancing vẫn có đường vẽ từng lá như trước.

`tests/browser.cjs` kiểm tra cả bốn cách trải tại 1440×900, 390×844, 320×568 và 844×390, gồm đổi kích thước giữa lúc lá đang bay. `tests/carousel-browser.cjs` chạm trực tiếp sau khi qua vòng mới và sau ba vòng ngược. `tests/feedback-browser.cjs` kiểm tra tiếng tự bật, tín hiệu âm thanh và phản hồi điện thoại mô phỏng. Các bài kiểm tra Node có thêm xác minh hình học, biến đổi và không vẽ trùng lá đã chọn.

Khởi động máy chủ rồi chạy:

```powershell
$env:TASK_PERF_LABEL='current'
node tarot-v2/tests/performance-browser.cjs
node tarot-v2/tests/render-parity-browser.cjs
```

Báo cáo gốc ở `artifacts/performance-before.json`, `artifacts/performance-after.json` và `artifacts/render-parity.json`. Công cụ đóng băng/đổi cách vẽ chỉ được mở khi chạy trên localhost với `?profile=1`; không có trong luồng sử dụng website công khai.

## Tối ưu tiếp và sửa tên lá trên điện thoại

- Hai nhóm mặt lưng giống nhau dùng chung một lượt dựng; vẫn giữ toàn bộ hình học, UV, cạnh vát và nhũ riêng cho từng lá. Khung xáo/chọn còn 15 lượt dựng thay cho 16 ở bản tối ưu trước.
- Sắp xếp các lá đục theo khoảng cách tới camera, dựng lá gần trước. Nền tinh vân dựng sau các bề mặt đục để GPU có thể bỏ qua điểm ảnh bị che kín. Giữ nguyên shader, chuyển động, chất lượng phân giải, số lá và số hạt. Đối chiếu ảnh bật/tắt cả hai tối ưu trên cùng khung hình ở WebGL 1/2 có sai lệch trung bình mỗi kênh dưới 0,002 trên thang 0–255 trong các mẫu đã thử.
- Tạo bounding box một lần để loại nhanh các cú chạm vào khoảng trống; cú chạm vào lá vẫn kiểm tra đúng toàn bộ tam giác gốc. Vuốt qua nhiều vòng vẫn chọn đúng danh tính lá.
- Chia việc chuẩn bị roughness, metalness và bump thành các công việc riêng, nhường thời gian giữa chúng. Độ phân giải, phép vẽ, lọc texture và ảnh kết quả giữ nguyên; vẫn không chuẩn bị texture trong chuyến bay hoặc khi đang lật.
- Ngắt các nhánh âm thanh khi nguồn đã phát hết, và chỉ ngắt panner chung khi lớp âm cuối cùng kết thúc. Không đổi âm lượng, lớp âm, âm sắc, độ vang hoặc lịch phát; master vẫn được giữ cho lần tương tác kế tiếp.

Tên lá có chiều rộng ổn định theo ô bố cục, chừa hàng riêng theo chiều cao chữ thực và không co lại khi lá quay cạnh về phía người xem. Khung nút dưới ổn định ngay từ lúc vào phần mở bài. Trải bốn lá dùng hai hàng khi đủ chiều cao, chuyển sang một hàng ở màn hình rất thấp để tránh đè chữ hàng kế tiếp. Khi ngắm gần, giữ tên lá đang xem và chuyển mờ các nhãn còn lại; trở về trải bài sẽ hiện đủ nhãn. Camera chừa chỗ cho tên và thanh nút.

`tests/layout-browser.cjs` kiểm tra tên dài, va chạm với mọi lá bài/thanh nút và thao tác ngắm gần rồi trở về ở bảy bố cục từ 320×568 đến 844×390. `tests/resources.test.cjs` kiểm tra phép vẽ PBR đồng bộ/chia bước giống nhau, hủy công việc cũ và giải phóng đủ nhánh âm thanh sau khi phát hết. Báo cáo bố cục nằm ở `artifacts/layout-report.json`; phép đo lượt tối ưu này nằm ở `artifacts/performance-mobile-layout.json`.
