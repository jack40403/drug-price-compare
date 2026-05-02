import type { Page } from 'playwright'
import { Connector } from '../connector'
import type { ProductResult } from '../connector'

export class BinLiConnector extends Connector {
  platformId = 'binli'
  platformName = '彬利'
  baseUrl = 'https://www.twbingli.com/index.php'

  async isLoggedIn(page: Page): Promise<boolean> {
    const loginBtn = await page.$('a.sign-first[title="會員登入"]')
    const isLoggedIn = loginBtn === null
    console.log(`[BinLi] Logged in status: ${isLoggedIn}`)
    return isLoggedIn
  }

  async login(page: Page, creds: any): Promise<boolean> {
    console.log('[BinLi] Navigating to login page...')
    await page.goto(this.baseUrl)
    
    console.log('[彬利] 正在輸入帳密 (擬人化)...')
    await this.humanType(page, 'input[placeholder="請輸入帳號"]', creds.username)
    await this.humanType(page, 'input[placeholder="請輸入密碼"]', creds.password)
    
    console.log('[BinLi] Clicking login button...')
    await page.click('button.ulogin.yellow')
    
    await page.waitForTimeout(4000)
    
    const success = await this.isLoggedIn(page)
    if (!success) {
      console.warn('[BinLi] Login attempt failed. You may need to solve a captcha or close a modal manually.')
    }
    return success
  }

  async search(page: Page, searchTerm: string): Promise<ProductResult[]> {
    console.log(`[BinLi] Searching for: "${searchTerm}"`)

    // [保留彈窗] 監聽對話框但不執行 dismiss()，讓視窗留給使用者看
    page.on('dialog', async dialog => {
      console.log(`[BinLi] 偵測到網頁提示: ${dialog.message()}`)
      // 故意不呼叫 dialog.dismiss() 或 dialog.accept()
      // 這樣視窗就會留在畫面上給使用者確認
    })

    await page.goto('https://www.twbingli.com/order.php')
    
    // Check for login redirect
    if (page.url().includes('login') || !await this.isLoggedIn(page)) {
      console.log('[BinLi] Not logged in or session expired, skipping search.')
      return []
    }

    const isCode = this.isNHICode(searchTerm)
    const targetSelector = isCode ? 'input[name="hid"]' : 'input[name="drug"]'
    const fieldName = isCode ? '健保碼' : '品名'

    console.log(`[彬利] ===============================`)
    console.log(`[彬利] 關鍵字: "${searchTerm}"`)
    console.log(`[彬利] 判定為健保碼: ${isCode}`)
    console.log(`[彬利] 最終判定結果 - 欄位: ${fieldName}, 內容: ${searchTerm}`)
    console.log(`[彬利] 動作: 填入 ${fieldName} 欄位 (${targetSelector})`)
    console.log(`[彬利] ===============================`)

    await this.fastType(page, targetSelector, searchTerm)
    await page.click('button.or_query, button:has-text("查詢")')
    
    console.log('[彬利] 正在等待搜尋結果載入...');
    try {
      // 關鍵修正：不再等 table，改為等待區塊式元件 .name-ingredient 出現
      await page.waitForSelector('.name-ingredient', { timeout: 12000 });
      console.log('[彬利] 偵測到結果區塊，正在進行最後穩定緩衝 (2秒)...');
      await page.waitForTimeout(2000); 
    } catch (e) {
      console.log('[彬利] 等待超時：可能該藥品無搜尋結果，或網頁載入過慢。');
      return [];
    }

    const results: ProductResult[] = await page.evaluate((platform) => {
      // 彬利新版網頁採用區塊式排版，不再使用 table
      const nameElements = document.querySelectorAll('.name-ingredient');
      if (nameElements.length === 0) return [];

      const products: any[] = [];
      
      nameElements.forEach((nameEl) => {
        const row = nameEl.parentElement;
        if (!row) return;

        // 1. 抓取品名 (在 .name-ingredient 內的 h3)
        const nameH3 = nameEl.querySelector('h3');
        if (!nameH3) return;
        const name = nameH3.innerText.trim();

        // 2. 抓取成分與備註 (在 .name-ingredient 內的其他文字)
        const fullText = (nameEl as HTMLElement).innerText || '';
        const otherLines = fullText.split('\n').map(l => l.trim()).filter(l => l && l !== name);
        const spec = otherLines[0] || '';
        const memo = otherLines.slice(1).join(' ');

        // 3. 抓取健保資訊 (在 .nhi)
        const nhiEl = row.querySelector('.nhi') as HTMLElement;
        const nhiText = nhiEl?.innerText || '';
        const nhiCodeMatch = nhiText.match(/[A-Z0-9]{10}/);
        const nhiCode = nhiCodeMatch ? nhiCodeMatch[0] : '';
        const nhiPriceMatch = nhiText.match(/健保價：\s*([\d,.]+)/);
        const nhiPrice = nhiPriceMatch ? parseFloat(nhiPriceMatch[1].replace(/,/g, '')) : 0;

        // 4. 抓取價格與單位 (精準定位標籤)
        const priceEl = row.querySelector('.price') as HTMLElement;
        const unitEl = row.querySelector('.unit') as HTMLElement;
        
        let price = 0;
        let unit = '';
        
        if (priceEl) {
          price = parseFloat(priceEl.innerText.replace(/[^0-9.]/g, ''));
        }
        
        if (unitEl) {
          // 去掉斜線與空格，保留純單位 (如：盒、排)
          unit = unitEl.innerText.replace(/[\/\s]/g, '').trim();
        } else {
          // 如果沒有 .unit 標籤，嘗試從狀態列正則抓取
          const statusText = row.querySelector('.stock-price-unit')?.innerText || '';
          const priceMatch = statusText.match(/([\d,.]+)\s*\/\s*([^\n\s]+)/);
          unit = priceMatch ? priceMatch[2].trim() : '單位';
        }

        // 庫存狀態
        const statusText = row.querySelector('.stock-price-unit')?.innerText || '';
        const stockStatus = statusText.split('\n')[0] || '未知';

        // 5. 效期偵測 (彬利移除效期功能)
        const expiry = '';

        // 過濾掉標題列 (如果有的話)
        if (name === '品名 / 成份') return;

        products.push({
          platform,
          name: name,
          spec: spec,
          price: isNaN(price) ? 0 : price,
          unit: unit || '單位',
          stock: stockStatus,
          link: window.location.href,
          expiry: expiry,
          memo: memo,
          nhiCode: nhiCode,
          nhiPrice: isNaN(nhiPrice) ? 0 : nhiPrice
        });
      });

      return products;
    }, this.platformName)

    console.log(`[BinLi] Scraped ${results.length} products.`)
    return results
  }
}
