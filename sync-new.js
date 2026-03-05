/**
 * sync-new.js
 * Chạy định kỳ để lấy reviews mới → merge vào reviews.json
 * Usage: node sync-new.js
 * Schedule: dùng schedule.js bên dưới, hoặc crontab/Task Scheduler
 */

const { chromium } = require('playwright');
const fs = require('fs');

const GOOGLE_MAPS_URL = 'https://www.google.com/maps/place/The+R129+Co/@51.1166892,0.6185083,682m/data=!3m2!1e3!4b1!4m6!3m5!1s0x47df244241282909:0x79a5978514106b9b!8m2!3d51.1166859!4d0.6210832!16s%2Fg%2F1hc17ljc4';
const OUTPUT_FILE = './reviews.json';
const SCROLL_ROUNDS = 4; // Scroll đủ để load ~20 reviews mới nhất

async function syncNewReviews() {
  console.log('[' + new Date().toLocaleString('en-GB') + '] 🔄 Sync reviews mới...');

  // Đọc file hiện tại
  let existingData = { reviews: [], totalCount: 0, lastFullScrape: null, storeUrl: GOOGLE_MAPS_URL };
  if (fs.existsSync(OUTPUT_FILE)) {
    existingData = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf-8'));
    console.log('   File hiện tại: ' + existingData.reviews.length + ' reviews');
  } else {
    console.log('   ⚠️  Chưa có reviews.json, hãy chạy scrape-all.js trước!');
  }
  const existingIds = new Set(existingData.reviews.map((r) => r.reviewId));

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    locale: 'en-US',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });

  try {
    await page.goto(GOOGLE_MAPS_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(4000);

    // Đóng popup
    for (const sel of ['button[aria-label="Close"]', 'button[aria-label="No thanks"]']) {
      try {
        const el = page.locator(sel).first();
        if (await el.count() > 0) { await el.click({ timeout: 2000 }); await page.waitForTimeout(1000); }
      } catch (_) {}
    }

    // Click store trong nav rail
    const storeBtn = page.locator('button[data-bundle-id]').first();
    if (await storeBtn.count() > 0) { await storeBtn.click(); await page.waitForTimeout(3000); }

    // Click tab Reviews
    await page.waitForSelector('[role="tab"]', { timeout: 10000 });
    const tabs = await page.locator('[role="tab"]').all();
    for (const tab of tabs) {
      const label = (await tab.getAttribute('aria-label').catch(() => '')) || '';
      if (label.toLowerCase().includes('review')) { await tab.click(); break; }
    }
    await page.waitForTimeout(2500);

    // Sort theo Newest
    try {
      const sortBtn = page.locator('button[aria-label*="Sort"]').first();
      if (await sortBtn.count() > 0) {
        await sortBtn.click();
        await page.waitForTimeout(800);
        const newestOpt = page.locator('[role="menuitemradio"]').filter({ hasText: /newest/i }).first();
        if (await newestOpt.count() > 0) {
          await newestOpt.click();
          await page.waitForTimeout(4000);
        }
      }
    } catch (_) {}

    // Scroll vài lần để load reviews mới nhất
    const feed = page.locator('div[aria-label*="review" i]').first();
    for (let i = 0; i < SCROLL_ROUNDS; i++) {
      await feed.evaluate((el) => el.scrollTo(0, el.scrollHeight));
      await page.waitForTimeout(1500);
    }

    // Extract và dedup
    const freshReviews = await page.evaluate(() => {
      const seen = new Set();
      const results = [];
      document.querySelectorAll('div[data-review-id]').forEach((el) => {
        const reviewId = el.getAttribute('data-review-id');
        if (seen.has(reviewId)) return;
        seen.add(reviewId);
        const author = el.querySelector('.d4r55')?.innerText?.trim() || '';
        const ratingEl = el.querySelector('span[aria-label*="star"]');
        const ratingMatch = ratingEl?.getAttribute('aria-label')?.match(/(\d)/);
        const rating = ratingMatch ? parseInt(ratingMatch[1]) : null;
        const text = el.querySelector('.wiI7pd')?.innerText?.trim() || el.querySelector('.MyEned span')?.innerText?.trim() || '';
        const timeText = el.querySelector('.rsqaWe')?.innerText?.trim() || '';
        const avatarEl = el.querySelector('img.NBa7we, button img');
        const avatar = avatarEl ? avatarEl.src : '';
        const isVerified = !!el.querySelector('.RfnDt, .QV3IV, span[aria-label*="Local Guide"]');
        const authorLinkEl = el.querySelector('button.WEBjve, button.al6Kxe, button[data-href*="contrib"]');
        const reviewUrl = authorLinkEl?.href || authorLinkEl?.getAttribute('data-href') || '';
        results.push({ reviewId, author, rating, text, timeText, avatar, isVerified, reviewUrl, scrapedAt: new Date().toISOString() });
      });
      return results;
    });

    const newReviews = freshReviews.filter((r) => r.reviewId && !existingIds.has(r.reviewId));
    console.log('   🆕 Reviews mới: ' + newReviews.length);

    if (newReviews.length > 0) {
      const merged = [...newReviews, ...existingData.reviews];
      const output = {
        storeUrl: GOOGLE_MAPS_URL,
        lastFullScrape: existingData.lastFullScrape,
        lastSync: new Date().toISOString(),
        totalCount: merged.length,
        reviews: merged,
      };
      fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf-8');
      console.log('   💾 Đã lưu. Tổng: ' + merged.length + ' reviews (+' + newReviews.length + ')');
      newReviews.slice(0, 3).forEach((r) => {
        console.log('   - [' + r.rating + '⭐] ' + r.author + ': "' + r.text.slice(0, 60) + '"');
      });
    } else {
      console.log('   ✅ Không có gì mới.');
    }

  } finally {
    await browser.close();
  }
}

syncNewReviews().catch(console.error);
