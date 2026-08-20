# Công cụ vẽ sơ đồ quy trình a

Vẽ sơ đồ quy trình/workflow kéo-thả, sinh sơ đồ bằng AI (Gemini) từ mô tả text, dữ liệu lưu ngay trên trình duyệt (IndexedDB) nên F5 hay tắt trình duyệt vẫn giữ nguyên các tab đang làm việc.

## Kiến trúc

- **Frontend**: React + Vite, chạy hoàn toàn phía trình duyệt.
- **Lưu trữ**: IndexedDB (`src/db.js`) — không cần server database. Có 2 tầng:
  - **Phiên làm việc (tabs)**: tự động lưu liên tục, khôi phục lại y nguyên khi mở lại trang, kể cả sơ đồ chưa bấm "Lưu".
  - **Thư viện đã lưu**: các sơ đồ được đặt tên, lưu rõ ràng bằng nút "Lưu vào thư viện".
- **AI**: `functions/api/generate.js` — một Cloudflare Pages Function đóng vai trò proxy, giữ API key Gemini ở phía server, frontend không bao giờ thấy key.

## Bước 1 — Đưa lên GitHub

```bash
cd diagram-tool
git init
git add .
git commit -m "Init diagram tool"
git branch -M main
git remote add origin https://github.com/<tên-bạn>/<tên-repo>.git
git push -u origin main
```

## Bước 2 — Lấy API key Gemini (miễn phí)

1. Vào https://aistudio.google.com/apikey
2. Đăng nhập bằng tài khoản Google, bấm "Create API key" (không cần thẻ tín dụng).
3. Copy key, lưu tạm ra chỗ khác (chỉ dùng ở bước 3, không đưa vào code hay commit lên GitHub).

## Bước 3 — Deploy qua Cloudflare Pages (miễn phí)

1. Vào https://dash.cloudflare.com → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
2. Chọn repo GitHub vừa tạo.
3. Cấu hình build:
   - **Framework preset**: Vite
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
4. Vào **Settings → Environment variables**, thêm biến:
   - `GEMINI_API_KEY` = key lấy ở bước 2 (đánh dấu **Encrypt**)
   - (tùy chọn) `GEMINI_MODEL` = `gemini-2.5-flash` (mặc định đã dùng model này nếu không set)
5. Bấm **Save and Deploy**. Cloudflare tự build và cấp cho bạn 1 domain dạng `ten-du-an.pages.dev`.

Từ lần push tiếp theo lên nhánh `main`, Cloudflare tự động build lại — không cần thao tác thủ công.

## Chạy thử ở máy local

```bash
npm install
npm run build
npx wrangler pages dev dist --compatibility-date=2024-01-01
```

Lệnh trên chạy cả frontend lẫn function `/api/generate` giống môi trường thật. Cần đặt biến môi trường trước khi chạy:

```bash
GEMINI_API_KEY=xxxxx npx wrangler pages dev dist
```

## Lưu ý về chi phí và giới hạn

- Gemini free tier hiện giới hạn khoảng vài chục request/phút và ~1000-1500 request/ngày tùy model, có thể thay đổi theo chính sách của Google.
- Vì key dùng chung cho mọi người truy cập trang, nếu chia sẻ công khai rộng rãi nên cân nhắc thêm giới hạn chống lạm dụng (ví dụ Cloudflare Turnstile để chặn bot, hoặc giới hạn số lần gọi theo IP bằng Cloudflare KV) — có thể bổ sung sau nếu cần.
- Dữ liệu sơ đồ lưu trong IndexedDB là **theo từng trình duyệt/thiết bị**, không đồng bộ giữa các máy. Nếu sau này cần dùng nhiều thiết bị, sẽ cần thêm tài khoản đăng nhập + database phía server (ví dụ Cloudflare D1 hoặc Supabase).

## Cấu trúc thư mục

```
diagram-tool/
├── functions/api/generate.js   # Proxy gọi Gemini, giữ API key
├── src/
│   ├── App.jsx                 # Toàn bộ giao diện + logic canvas
│   ├── db.js                   # Lớp IndexedDB (tabs + thư viện)
│   └── main.jsx
├── index.html
├── package.json
└── vite.config.js
```
