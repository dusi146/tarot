# Trải bài 3D — phân tích và cập nhật

Ngày cập nhật: 14/10/2026. Phạm vi: giao diện chính, chọn bài, xáo và lật bài.

## Vì sao trải nghiệm cũ chưa mượt

- Dải bài đặt 78 lá gần nhau theo góc trên cùng một cung. Khoảng cách nhỏ hơn bề ngang lá, trong khi góc xoay và độ nâng thay đổi độc lập, khiến các lá xuyên nhau hoặc đổi thứ tự che phủ.
- Di chuyển quá nhạy và tốc độ bám mục tiêu cao. Sau khi thả, dải bài chưa có điểm dừng rõ để chọn.
- Có thể rút nhiều lá khi chuyến bay trước chưa xong. Các đường bay giao nhau, trạng thái chọn và chuyển cảnh dễ chạy chồng.
- Chồng bài xếp chủ yếu theo trục đứng thay vì theo pháp tuyến mặt bài, nên các khối bài thực sự giao nhau. Xáo cả 78 lá cùng lúc làm cảnh rối và tăng việc vẽ.
- Các phép tính bố cục dùng cho điện thoại dọc chưa dành đủ chỗ cho điều khiển khi xoay ngang.
- Nhiều lượt vẽ, mật độ điểm ảnh cao và bộ đếm/chuyển động chạy cùng lúc làm thiết bị yếu dễ hụt khung hình. Tải ảnh giữa lúc lật cũng có thể gây khựng.

## Đã sửa

| Phần | Hành vi hiện tại |
| --- | --- |
| Vuốt chọn | Dải bài tách rời, lá giữa lớn, lá bên nhỏ và lùi sâu. Chỉ vẽ các lá gần vùng nhìn. Khoảng cách dành sẵn cho góc xoay và nâng khi rê chuột. |
| Chuyển động | Quán tính phụ thuộc thời gian, bám chậm hơn và tự dừng ở lá gần nhất chưa rút. Xòe bài 1,4 giây; rút 0,82 giây; lật chậm hơn. |
| Đi qua cả bộ | Thanh lướt với vùng chạm 44 px, điều khiển bằng bàn phím và vị trí trên tổng 78 lá. |
| Rút bài | Nút chọn chờ lá giữa dừng đúng vị trí. Một chuyến bay tại một thời điểm. Lá đã rút thu về ô trạng thái, ra khỏi vùng vuốt. Chỉ chuyển sang bàn mở khi đủ lá đã hạ cánh. |
| Hình lá bài | Góc bo và cạnh mỏng có vát, mặt sau xanh đêm với trăng/quỹ đạo và nét vàng mảnh. Giữ hai nhóm vật liệu cho lá chưa rút. |
| Xáo bài | Dùng 12 lá đại diện trên ba tầng thay vì 78 lá bay xuyên nhau. Chồng đóng xếp theo pháp tuyến với khe hở vật lý. Bộ dữ liệu chọn vẫn đủ 78 lá. |
| Nền | Tinh vân trôi nhẹ, sao sáng dịu theo thời gian trên GPU, hai vòng quỹ đạo đổi góc chậm, đặt hẳn sau lớp bài để không xuyên qua hình. Không vẽ lại canvas nền mỗi khung hình. |
| Điện thoại | Dọc giữ nút ở dưới; ngang chuyển điều khiển sang bên phải để lá bài đủ lớn. Trải bốn lá dọc dùng lưới 2 × 2. |
| Độ ổn định | Hủy thao tác khi mất tập trung, xử lý ngón tay thứ hai, khóa chọn trong chuyển cảnh, xếp hàng lật và cập nhật đích khi đổi kích thước. Phiên cũ không ghi đè phiên mới. |
| Tải và hiệu năng | Thư viện cục bộ, tải/cache/upload ảnh trước khi mở, dự phòng ảnh lỗi, dừng khi ẩn trang, giới hạn và tự giảm mật độ điểm ảnh khi cần. |

Trang hiệu ứng thử nghiệm và liên kết truy cập đã được gỡ khỏi ứng dụng.

## Kiểm tra

Chạy: node --test tests/*.test.cjs

19/19 kiểm thử tự động đạt. Dùng hình học, raycast Three.js và timeline GSAP thật; DOM, GPU, vận chuyển ảnh và API được mô phỏng.

Kiểm tra bao gồm:

- Biên thực tế của lá bài bo góc, chiều mặt, UV và số nhóm vật liệu.
- Biên hình học của các lá trong suốt lượt vuốt ở nhiều kích thước, bao gồm mức nâng tối đa: không giao nhau theo trục ngang. Kiểm tra thêm đường bao sau khi chiếu lên màn hình dọc, ngang và desktop để tránh che lấp do phối cảnh.
- Khe hở giữa 78 lá trong chồng đóng; phép neo theo màn hình khi camera nghiêng.
- Quán tính ở 30/60/120/144 Hz, hồi về hai đầu và đủ các bố cục 1/3/4 lá.
- Khóa trong lúc xòe/rút, chống rút trùng, vuốt/hủy không chọn nhầm, thanh lướt tới cả hai đầu.
- Giữ ngắn, ngón tay thứ hai, mất hiển thị, khôi phục context, tải ảnh lỗi.
- Lật liên tục, đổi kích thước giữa lúc lật hoặc rút, bắt đầu lại giữa hiệu ứng, yêu cầu lời giải cũ không ghi đè phiên mới.

Đã kiểm tra giao diện trực tiếp bằng trình duyệt ở 390 × 844, 320 × 568, 844 × 390 và 1280 × 800; rút đủ bốn lá, mở lần lượt, vuốt và xoay màn hình. Không thấy lỗi JavaScript/WebGL trong những luồng đã kiểm tra. API lời giải được kiểm tra bằng phản hồi mô phỏng; không gửi yêu cầu trả phí khi thử giao diện.

Giới hạn: kết quả trên trình duyệt máy tính không thay thế đo hiệu năng trên điện thoại thật. Không cam kết cùng mức FPS trên mọi GPU. Kiểm tra hình học chứng minh dải chọn tách nhau khi đã xòe; chuyển cảnh còn có sự che phủ thị giác có chủ đích.
