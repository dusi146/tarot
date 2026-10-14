# Ta Văn Rót

Website tarot 3D mới được phát triển trực tiếp từ bản 3D do chủ trang cung cấp. Bản đang xuất bản tại [tavanrot.online](https://tavanrot.online/) dùng mã trong **tarot-v2/**. Các tệp web cũ ở thư mục gốc được giữ để đối chiếu, không được đóng gói vào GitHub Pages.

## Chạy trên máy

```powershell
node tarot-v2/serve.cjs
```

Mở http://127.0.0.1:4182/?preview=1 để xem thử bằng lời giải mô phỏng, không gửi dữ liệu ra ngoài. Bỏ `?preview=1` để dùng AI và Google Sheets thật.

Xem [chức năng và kết quả kiểm tra V2](tarot-v2/README.md), [cấu hình Intern → Groq → Gemini](tarot-v2/apps-script/SETUP.md).

## Xuất bản

Workflow `.github/workflows/deploy.yml` chạy kiểm tra rồi dùng `tools/build-pages.cjs` tạo gói `_site`. Gói chỉ chứa giao diện, font, ảnh và thư viện dựng hình của V2. Các tệp mã có phiên bản theo commit để tránh dùng lẫn cache cũ. GitHub Pages dùng chế độ GitHub Actions, giữ tên miền hiện có.

Khóa API chỉ nằm trong Script Properties của Google Apps Script. Website chỉ lưu địa chỉ `/exec` trong `tarot-v2/js/sheets-config.js`. Không chèn khóa vào GitHub Secrets để dựng thành JavaScript công khai, không thêm các cấu hình khóa cục bộ vào Git.

## Kiểm tra

```powershell
node --test tarot-v2/tests/*.test.cjs
node tarot-v2/tests/browser.cjs
node tarot-v2/tests/carousel-browser.cjs
node tarot-v2/tests/services-browser.cjs
```

Các bài kiểm tra giao diện cần Chrome và `puppeteer` trong môi trường phát triển. Chạy máy chủ trước khi thử. CI chỉ chạy các bài kiểm tra Node, không dùng khóa hoặc gọi AI thật.

## Bản trước

Bản cũ trên Git được lưu tại tag `backup-20261014-160026` (commit `d63ffe2`). Bản dự phòng đầy đủ trên máy nằm trong `backups/`; thư mục này không được đưa lên Git hay website.
