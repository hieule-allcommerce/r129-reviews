const { chromium } = require('playwright');

const GOOGLE_MAPS_URL = 'https://www.google.com/maps/place/The+R129+Co/@51.1166892,0.6185083,682m/data=!3m2!1e3!4b1!4m6!3m5!1s0x47df244241282909:0x79a5978514106b9b!8m2!3d51.1166859!4d0.6210832!16s%2Fg%2F1hc17ljc4';

async function test() {
  console.log('🧪 Test mode - chỉ lấy ~10 reviews\n');

  const browser = await chromium.launch({ headless: false });
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
    console.log('   ✅ Load xong');

    // 2. Click vào store trong navigation rail (button.atHn2d)
    console.log('\n2️⃣  Click vào store trong nav rail...');
    const storeBtn = page.locator('button.atHn2d').first();
    if (await storeBtn.count() > 0) {
      await storeBtn.click();
      console.log('   ✅ Clicked store button');
      await page.waitForTimeout(3000);
    } else {
      console.log('   ⚠️  Không tìm thấy button.atHn2d, thử selector khác...');
      // Fallback: tìm button có data-bundle-id
      const bundleBtn = page.locator('button[data-bundle-id]').first();
      if (await bundleBtn.count() > 0) {
        await bundleBtn.click();
        console.log('   ✅ Clicked button[data-bundle-id]');
        await page.waitForTimeout(3000);
      }
    }

    // 3. Bây giờ tìm tab Reviews
    console.log('\n3️⃣  Tìm tab Reviews...');
    await page.waitForSelector('[role="tab"]', { timeout: 10000 });

    const roleTabs = await page.locator('[role="tab"]').all();
    console.log('   Tabs tìm thấy:');
    for (const tab of roleTabs) {
      const text = (await tab.innerText().catch(() => '')) || '';
      const label = (await tab.getAttribute('aria-label').catch(() => '')) || '';
      console.log('   - label="' + label + '" text="' + text.trim() + '"');
    }

    let clicked = false;
    for (const tab of roleTabs) {
      const text = (await tab.innerText().catch(() => '')) || '';
      const label = (await tab.getAttribute('aria-label').catch(() => '')) || '';
      const combined = (text + ' ' + label).toLowerCase();
      if (combined.includes('review') && !combined.includes('write')) {
        await tab.click();
        console.log('\n   ✅ Clicked Reviews tab: "' + text.trim() + '"');
        clicked = true;
        break;
      }
    }

    if (!clicked) {
      console.log('   ❌ Không tìm thấy tab Reviews. Xem browser...');
      await page.waitForTimeout(20000);
      await browser.close();
      return;
    }

    await page.waitForTimeout(2500);

    // 4. Tìm feed và scroll
    console.log('\n4️⃣  Scroll để load reviews...');
    let feed = null;
    for (const sel of ['div[role="feed"]', 'div[aria-label*="review" i]']) {
      const el = page.locator(sel).first();
      if (await el.count() > 0) { feed = el; console.log('   Feed: ' + sel); break; }
    }

    if (!feed) {
      console.log('   ❌ Không tìm thấy feed!');
      await page.waitForTimeout(20000);
      await browser.close();
      return;
    }

    for (let i = 0; i < 2; i++) {
      await feed.evaluate((el) => el.scrollTo(0, el.scrollHeight));
      await page.waitForTimeout(1800);
      const count = await page.locator('div[data-review-id]').count();
      console.log('   Scroll ' + (i+1) + ': ' + count + ' reviews loaded');
    }

    // 5. Extract
    console.log('\n5️⃣  Extract...');
    const reviews = await page.evaluate(() => {
      const items = document.querySelectorAll('div[data-review-id]');
      return Array.from(items).map((el) => {
        const reviewId = el.getAttribute('data-review-id');
        const author = el.querySelector('.d4r55')?.innerText?.trim() || el.querySelector('.DU9Pgb')?.innerText?.trim() || '';
        const ratingEl = el.querySelector('span[aria-label*="star"]');
        const ratingMatch = ratingEl?.getAttribute('aria-label')?.match(/(\d)/);
        const rating = ratingMatch ? parseInt(ratingMatch[1]) : null;
        const text = el.querySelector('.wiI7pd')?.innerText?.trim() || el.querySelector('.MyEned span')?.innerText?.trim() || '';
        const timeText = el.querySelector('.rsqaWe')?.innerText?.trim() || '';
        return { reviewId, author, rating, text, timeText };
      });
    });

    if (reviews.length === 0) {
      const count = await page.locator('div[data-review-id]').count();
      console.log('   data-review-id count: ' + count);
      if (count === 0) {
        const feedHTML = await feed.evaluate(el => el.innerHTML.slice(0, 3000));
        console.log('\n   Feed HTML:\n' + feedHTML);
      }
      console.log('\n   ❌ Extract 0 reviews.');
      await page.waitForTimeout(20000);
    } else {
      console.log('\n✅ ' + reviews.length + ' reviews:\n');
      reviews.forEach((r, i) => {
        console.log('[' + (i+1) + '] ⭐' + (r.rating ?? '?') + ' | ' + r.author + ' (' + r.timeText + ')');
        if (r.text) console.log('     "' + r.text.slice(0, 100) + '"\n');
      });
      console.log('🎉 Test thành công! Giờ chạy scrape-all.js để lấy toàn bộ.');
      await page.waitForTimeout(3000);
    }

  } catch (err) {
    console.error('\n❌ Lỗi:', err.message);
    await page.waitForTimeout(15000);
  } finally {
    await browser.close();
  }
}

test().catch(console.error);
