import type { Page } from 'playwright'
import { Connector } from '../connector'
import type { ProductResult } from '../connector'

export class MDTConnector extends Connector {
  platformId = 'mdt'
  platformName = '蔓達特'
  baseUrl = 'https://www.mdtky.com.tw/Member/login'

  async isLoggedIn(page: Page): Promise<boolean> {
    try {
      const currentUrl = page.url()
      // [優化] 改用網址路徑作為登入成功判定，不再辨識「登出」字樣
      return currentUrl.includes('mdtky.com.tw/Shop/') || currentUrl.includes('Product/Search')
    } catch (e) {
      return false
    }
  }

  async login(page: Page, creds: any): Promise<boolean> {
    console.log('[蔓達特] 正在導向登入頁面...')
    await page.goto(this.baseUrl, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1000)

    if (await this.isLoggedIn(page)) return true

    console.log('[蔓達特] 正在打字輸入帳密 (擬人化)...')
    await this.humanType(page, 'input#Account', creds.username)
    await this.humanType(page, 'input#PWD', creds.password)
    
    // [優化] 等待使用者手動輸入驗證碼並登入
    // 監控網址變化，直到離開登入頁面且進入商城或產品區域
    try {
      console.log('[蔓達特] 等待手動登入成功...')
      await page.waitForFunction(() => {
        const url = window.location.href
        return url.includes('mdtky.com.tw/Shop/') || url.includes('Product/Search') || (url === 'https://www.mdtky.com.tw/')
      }, { timeout: 300000 }) // 統一等待 5 分鐘處理驗證碼
      
      console.log('[蔓達特] 偵測到登入成功，正在跳轉至產品搜尋頁面...')
      // 成功後強制跳轉至使用者要求的網址
      await page.goto('https://www.mdtky.com.tw/Shop/Product/', { waitUntil: 'domcontentloaded' })
    } catch (e) {
      console.warn('[蔓達特] 等待登入超時或發生錯誤，請檢查瀏覽器狀態。')
    }

    return true
  }

  async search(page: Page, searchTerm: string): Promise<ProductResult[]> {
    console.log(`[蔓達特] 執行優化後的定位器搜尋: "${searchTerm}"`)

    // [優化] 在搜尋開始時確保位於產品搜尋頁，省去登入時的等待時間
    if (!page.url().includes('Shop/Product/')) {
      console.log('[蔓達特] 偵測到未在搜尋頁，正在主動跳轉...')
      await page.goto('https://www.mdtky.com.tw/Shop/Product/index', { waitUntil: 'domcontentloaded' })
    }
    
    try {
      // [優化] 使用 Playwright Locator 模式，整合多種選擇器 (ID, 屬性, Class)
      console.log('[蔓達特] 正在打字搜尋關鍵字 (極速)...')
      await this.fastType(page, '#webtxtKey, #txtKey, input[placeholder*="請輸入關鍵字"], input.search-txt', searchTerm)

      // 提交搜尋 (按下 Enter 或點擊搜尋按鈕)
      const searchBtn = page.locator('button#txtBtnSearch, button.search-btn, i.fa-search, a.searchTag').first();
      
      if (await searchBtn.isVisible()) {
        await searchBtn.click();
      } else {
        await page.keyboard.press('Enter');
      }

      // 等待清單載入 (蔓達特通常是 li 結構)
      await page.waitForSelector('li, .productBox', { timeout: 8000 })
      // 給予額外穩定時間
      await page.waitForTimeout(1000)
    } catch (e) {
      console.warn('[蔓達特] 搜尋過程中發生錯誤:', e)
      return []
    }

    const results: ProductResult[] = await page.evaluate((platform) => {
      // 曼達特可能是 li 或 .pdConList / .pdList 等結構
      // 我們尋找所有可能包含產品資訊的容器
      const cards = Array.from(document.querySelectorAll('li, .pdConList, .pdList, .chessboardList')).filter(el => {
        const text = el.innerText;
        // 只要有價格符號，或者有缺貨/購物車字眼，且寬度足夠，就視為產品
        return (text.includes('$') || text.includes('售完') || text.includes('補貨中')) && 
               (el as HTMLElement).offsetWidth > 150;
      });

      return cards.map(card => {
        const text = (card as HTMLElement).innerText;
        const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
        
        // 1. 健保序號與健保價
        const nhiMatch = text.match(/[A-Z0-9]{10}/);
        const nhiCode = nhiMatch ? nhiMatch[0] : '';
        const nhiPriceMatch = text.match(/健保價\s*[:：]\s*([\d,.]+)/);
        const nhiPrice = nhiPriceMatch ? parseFloat(nhiPriceMatch[1].replace(/,/g, '')) : 0;

        // 2. 品名 (跳過產品代碼)
        let name = lines[0] || '未知藥名';
        if (/^[0-9A-Z]+$/.test(name) && lines[1]) {
          name = lines[1];
        }

        // 3. 規格 (通常在品名下一行)
        const specIndex = lines.findIndex(l => l === name) + 1;
        const spec = (specIndex > 0 && lines[specIndex] && !lines[specIndex].includes('$')) ? lines[specIndex] : '';

        // 4. 價格與單位
        const priceLineIndex = lines.findIndex(l => l.includes('$'));
        const priceText = priceLineIndex >= 0 ? lines[priceLineIndex].replace(/[^0-9.]/g, '') : '0';
        const price = parseFloat(priceText);
        
        // 單位偵測
        const unitMatch = lines[priceLineIndex]?.match(/\$\s*[\d,.]+\s*([^\n\s]+)/);
        const unit = unitMatch ? unitMatch[1] : ((priceLineIndex >= 0 && lines[priceLineIndex + 1]) ? lines[priceLineIndex + 1] : '單位');

        // 5. 效期
        const expiryMatch = text.match(/(\d{4}[-/]\d{2}[-/]\d{2})/);
        const expiry = expiryMatch ? expiryMatch[0] : '';

        // 6. 庫存
        const isOutOfStock = text.includes('售完') || text.includes('缺貨') || text.includes('補貨中');
        const stockStatus = isOutOfStock ? '售完/缺貨' : '有供貨';

        return {
          platform,
          name: name,
          spec: spec,
          price: isNaN(price) ? 0 : price,
          unit: unit,
          stock: stockStatus,
          link: window.location.href,
          expiry: expiry,
          memo: '',
          nhiCode: nhiCode,
          nhiPrice: isNaN(nhiPrice) ? 0 : nhiPrice
        }
      });
    }, this.platformName)

    return results
  }
}
