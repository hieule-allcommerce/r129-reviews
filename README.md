# Google Reviews Scraper

Scrape toàn bộ reviews từ Google Maps bằng Playwright, lưu vào file JSON.

## Setup

```bash
# 1. Cài dependencies
npm install

# 2. Cài Playwright browser
npx playwright install chromium
```

## Cấu hình

Mở cả 2 file và thay `GOOGLE_MAPS_URL` bằng URL Google Maps store của bạn:

```js
const GOOGLE_MAPS_URL = 'https://www.google.com/maps/place/TEN_STORE/@...';
```

**Cách lấy URL:** Mở Google Maps → tìm store → copy URL trên thanh địa chỉ.

---

## Chạy

### Lần đầu tiên — scrape toàn bộ
```bash
node scrape-all.js
# hoặc
npm run scrape-all
```
> Với 500-2000 reviews, có thể mất 5-15 phút.

### Định kỳ — sync reviews mới
```bash
node sync-new.js
# hoặc
npm run sync
```

---

## Tự động chạy định kỳ (crontab — Linux/Mac)

```bash
# Mở crontab
crontab -e

# Thêm dòng này để chạy mỗi 4 giờ
0 */4 * * * cd /đường/dẫn/tới/thư/mục && node sync-new.js >> sync.log 2>&1
```

**Windows** dùng Task Scheduler thay thế.

---

## Output — reviews.json

```json
{
  "storeUrl": "https://maps.google.com/...",
  "lastFullScrape": "2024-01-15T10:00:00.000Z",
  "lastSync": "2024-01-15T14:00:00.000Z",
  "totalCount": 1250,
  "reviews": [
    {
      "reviewId": "abc123",
      "author": "Nguyễn Văn A",
      "rating": 5,
      "text": "Quán rất ngon!",
      "timeText": "2 tuần trước",
      "avatar": "https://...",
      "scrapedAt": "2024-01-15T10:00:00.000Z"
    }
  ]
}
```

---

## Lưu ý

- Google có thể thay đổi UI → selector CSS bị lỗi. Nếu vậy hãy inspect lại và update selector trong code.
- Không nên chạy quá thường xuyên (< 1 giờ/lần) để tránh bị Google block.
- Nếu bị captcha, thử đổi `headless: false` để xem browser chạy.
