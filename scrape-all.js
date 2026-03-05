/**
 * scrape-all.js
 * Chạy 1 lần đầu để scrape TOÀN BỘ reviews → lưu vào reviews.json
 * Usage: node scrape-all.js
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const GOOGLE_MAPS_URL = 'https://www.google.com/maps/place/The+R129+Co/@51.1166892,0.6185083,682m/data=!3m2!1e3!4b1!4m6!3m5!1s0x47df244241282909:0x79a5978514106b9b!8m2!3d51.1166859!4d0.6210832!16s%2Fg%2F1hc17ljc4';
const OUTPUT_FILE = './reviews.json';
const SCROLL_PAUSE_MS = 2500;
const MAX_NO_NEW_ROUNDS = 5;

async function scrapeAllReviews() {
  console.log('🚀 Bắt đầu scrape toàn bộ reviews...\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    locale: 'en-US',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });

  try {
    // 1. Load trang
    console.log('1️⃣  Load trang...');
    await page.goto(GOOGLE_MAPS_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(4000);

    // Đóng popup nếu có
    for (const sel of ['button[aria-label="Close"]', 'button[aria-label="No thanks"]', 'button:has-text("Reject all")']) {
      try {
        const el = page.locator(sel).first();
        if (await el.count() > 0) { await el.click({ timeout: 2000 }); await page.waitForTimeout(1000); }
      } catch (_) {}
    }

    // 2. Click vào store trong nav rail
    console.log('2️⃣  Mở store detail...');
    const storeBtn = page.locator('button[data-bundle-id]').first();
    if (await storeBtn.count() > 0) {
      await storeBtn.click();
      await page.waitForTimeout(3000);
      console.log('   ✅ Đã vào store detail');
    }

    // 3. Click tab Reviews
    console.log('3️⃣  Click tab Reviews...');
    await page.waitForSelector('[role="tab"]', { timeout: 10000 });
    const tabs = await page.locator('[role="tab"]').all();
    let clicked = false;
    for (const tab of tabs) {
      const label = (await tab.getAttribute('aria-label').catch(() => '')) || '';
      if (label.toLowerCase().includes('review')) {
        await tab.click();
        console.log('   ✅ Clicked: "' + label + '"');
        clicked = true;
        break;
      }
    }
    if (!clicked) throw new Error('Không tìm thấy tab Reviews!');
    await page.waitForTimeout(2500);

    // 4. Sort theo Newest
    console.log('4️⃣  Sort theo mới nhất...');
    try {
      const sortBtn = page.locator('button[aria-label*="Sort"]').first();
      if (await sortBtn.count() > 0) {
        await sortBtn.click();
        await page.waitForTimeout(800);
        const newestOpt = page.locator('[role="menuitemradio"]').filter({ hasText: /newest/i }).first();
        if (await newestOpt.count() > 0) {
          await newestOpt.click();
          console.log('   ✅ Sorted by Newest');
          // Chờ feed re-render sau khi sort
          await page.waitForTimeout(4000);
        }
      }
    } catch (_) {
      console.log('   ⚠️  Không sort được, dùng thứ tự mặc định');
    }

    // 5. Scroll toàn bộ
    console.log('5️⃣  Đang scroll để load tất cả reviews...');

    // Tìm đúng scrollable container
    const scrollableContainer = await page.evaluate(() => {
      // Thử tìm container có overflow scroll và chứa reviews
      const candidates = [
        'div[role="feed"]',
        'div[aria-label*="review" i]',
        '.m6QErb.DxyBCb',
        '.m6QErb[aria-label]',
        '.DxyBCb',
      ];
      for (const sel of candidates) {
        const el = document.querySelector(sel);
        if (el) {
          const style = window.getComputedStyle(el);
          const scrollable = el.scrollHeight > el.clientHeight;
          console.log(sel, 'scrollHeight:', el.scrollHeight, 'clientHeight:', el.clientHeight, 'scrollable:', scrollable);
          if (scrollable) return sel;
        }
      }
      // Fallback: tìm element có scrollHeight lớn nhất
      const allDivs = document.querySelectorAll('div');
      let best = null, bestH = 0;
      for (const d of allDivs) {
        if (d.scrollHeight > d.clientHeight + 100 && d.scrollHeight > bestH) {
          bestH = d.scrollHeight;
          best = d.className?.slice(0, 50) || d.id;
        }
      }
      return best ? ('.' + best.split(' ')[0]) : null;
    });

    console.log('   Scrollable container:', scrollableContainer);

    // Lấy locator cho container
    const feedLocator = scrollableContainer
      ? page.locator(scrollableContainer).first()
      : page.locator('div[aria-label*="review" i]').first();

    let previousCount = 0;
    let noNewRounds = 0;

    while (noNewRounds < MAX_NO_NEW_ROUNDS) {
      // Scroll bằng JS trực tiếp vào container
      await feedLocator.evaluate((el) => el.scrollTo({ top: el.scrollHeight, behavior: 'instant' }));
      await page.waitForTimeout(SCROLL_PAUSE_MS);

      // Expand "More" buttons
      const moreBtns = await page.locator('button[aria-label="See more"]').all();
      for (const btn of moreBtns) { try { await btn.click(); } catch (_) {} }

      const uniqueIds = await page.evaluate(() => {
        const els = document.querySelectorAll('div[data-review-id]');
        return new Set(Array.from(els).map(el => el.getAttribute('data-review-id'))).size;
      });

      if (uniqueIds > previousCount) {
        console.log('   ✅ ' + uniqueIds + ' unique reviews loaded...');
        previousCount = uniqueIds;
        noNewRounds = 0;
      } else {
        noNewRounds++;
        console.log('   ⏳ Không có mới (' + noNewRounds + '/' + MAX_NO_NEW_ROUNDS + ')...');
      }
    }

    console.log('\n   Tổng unique reviews đã load: ' + previousCount);

    // 6. Extract và dedup
    console.log('6️⃣  Extract dữ liệu...');
    const reviews = await page.evaluate(() => {
      const seen = new Set();
      const results = [];
      document.querySelectorAll('div[data-review-id]').forEach((el) => {
        const reviewId = el.getAttribute('data-review-id');
        if (seen.has(reviewId)) return; // bỏ duplicate
        seen.add(reviewId);

        const author = el.querySelector('.d4r55')?.innerText?.trim() || el.querySelector('.DU9Pgb')?.innerText?.trim() || '';
        const ratingEl = el.querySelector('span[aria-label*="star"]');
        const ratingMatch = ratingEl?.getAttribute('aria-label')?.match(/(\d)/);
        const rating = ratingMatch ? parseInt(ratingMatch[1]) : null;
        const text = el.querySelector('.wiI7pd')?.innerText?.trim() || el.querySelector('.MyEned span')?.innerText?.trim() || '';
        const timeText = el.querySelector('.rsqaWe')?.innerText?.trim() || '';
        const avatarEl = el.querySelector('img.NBa7we, button img');
        const avatar = avatarEl ? avatarEl.src : '';

        const isVerified = !!el.querySelector(".RfnDt, .QV3IV");

        // Link dẫn tới review trên Google Maps
        const authorLinkEl = el.querySelector('button.WEBjve, button.al6Kxe, button[data-href*="contrib"]');
        const reviewUrl = authorLinkEl?.href || authorLinkEl?.getAttribute('data-href') || '';
        results.push({ reviewId, author, rating, text, timeText, avatar, isVerified, reviewUrl, scrapedAt: new Date().toISOString() });
      });
      return results;
    });

    console.log('   ✅ ' + reviews.length + ' reviews sau khi dedup');

    // 7. Lưu file
    const output = {
      storeUrl: GOOGLE_MAPS_URL,
      lastFullScrape: new Date().toISOString(),
      lastSync: null,
      totalCount: reviews.length,
      reviews,
    };
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf-8');
    console.log('\n💾 Đã lưu: ' + path.resolve(OUTPUT_FILE));
    console.log('🎉 Xong! Tổng ' + reviews.length + ' reviews.');

  } catch (err) {
    console.error('❌ Lỗi:', err.message);
    throw err;
  } finally {
    await browser.close();
  }
}

scrapeAllReviews().catch((err) => { console.error(err); process.exit(1); });
