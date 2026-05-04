import type { Page } from 'playwright'
import { Connector } from '../connector'
import type { ProductResult } from '../connector'

export class JhaoHongConnector extends Connector {
  platformId = 'jhao-hong'
  platformName = '兆宇 (兆宏)'
  baseUrl = 'https://www.jhao-hong.com.tw/'

  async isLoggedIn(page: Page): Promise<boolean> {
    try {
      const currentUrl = page.url()
      // Check for logout button OR if we are on the landing pages
      const logoutBtn = await page.$('button#logout, a:has-text("登出"), .user-info')
      const isLoggedIn = logoutBtn !== null || 
                         currentUrl.includes('prdindex.php') || 
                         currentUrl.includes('order.php')
      
      console.log(`[JhaoHong] 登入狀態檢查: ${isLoggedIn} (URL: ${currentUrl})`)
      return isLoggedIn
    } catch (e) {
      return false
    }
  }

  async login(page: Page, creds: any): Promise<boolean> {
    console.log('[JhaoHong] 正在導覽至登入頁面...')
    await page.goto(this.baseUrl, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)
    
    if (await this.isLoggedIn(page)) return true

    console.log('[JhaoHong] 開啟登入彈窗...')
    const signInBtn = await page.$('button.signin, a:has-text("登入")')
    if (signInBtn) {
      await signInBtn.click()
      await page.waitForTimeout(1500)
    }
    
    console.log('[兆宏] 正在輸入帳密 (擬人化)...')
    await this.humanType(page, 'input[placeholder*="帳號"]', creds.username)
    await this.humanType(page, 'input[placeholder*="密碼"]', creds.password)
    
    console.log('[JhaoHong] 提交登入選項...')
    await page.click('button.login')
    
    // 等待跳轉並處理潛在彈窗
    await page.waitForTimeout(1500)
    
    // 清除可能擋住搜尋框的彈窗
    const confirmBtn = await page.$('button.confirm.button')
    if (confirmBtn) {
      console.log('[JhaoHong] 登入後檢測到公告，自動點擊「了解」...')
      await confirmBtn.click()
      await page.waitForTimeout(500)
    }
    
    const success = await this.isLoggedIn(page)
    console.log(`[JhaoHong] 最終登入結果: ${success}`)
    return success
  }

  async search(page: Page, searchTerm: string, filters?: any): Promise<ProductResult[]> {
    console.log(`[JhaoHong] 執行常駐搜尋框搜尋: "${searchTerm}", Filters: ${JSON.stringify(filters)}`)
    
    try {
      // 1. [優化] 定位搜尋框 (如果沒看到就滾動尋找)
      let input = await page.$('input.search')
      if (!input) {
        console.log('[JhaoHong] 視線內未發現搜尋框，嘗試向下滾動...')
        await page.evaluate(() => window.scrollBy(0, 400))
        await page.waitForTimeout(500)
        input = await page.$('input.search')
      }
      
      // 如果還是沒找到，嘗試最後一次等待
      if (!input) {
        await page.waitForSelector('input.search', { timeout: 3000 })
        input = await page.$('input.search')
      }

      if (input) {
        await input.scrollIntoViewIfNeeded()
        await page.waitForTimeout(300)
        
        // 2. 模擬真人：實體點擊搜尋框 (滑鼠點擊)
        console.log('[JhaoHong] 模擬實體滑鼠點擊搜尋框...')
        await input.click()
        await page.waitForTimeout(300)

        // 3. 根據手動勾選切換搜尋模式 (名稱 vs 健保碼)
        const isCode = filters?.code === true;
        const filterValue = isCode ? 'nhi' : 'name'
        console.log(`[兆宇] 手動切換模式為: ${filterValue}`)
        
        try {
          const filterSelect = page.locator('select.filter').first()
          if (await filterSelect.isVisible()) {
            await filterSelect.selectOption(filterValue)
            await page.waitForTimeout(200)
          }
        } catch (e) {
          console.warn('[兆宇] 無法切換篩選模式，將直接進行通用搜尋。')
        }
        
        console.log('[兆宇] 執行極速貼入搜尋關鍵字...')
        await this.fastType(page, 'input.search', searchTerm)
        
        // 4. 觸發搜尋：優先點擊按鈕，若無按鈕則按 Enter
        const searchBtn = await page.$('button.multi.search, .multi.search, button:has-text("搜尋")')
        if (searchBtn) {
          await searchBtn.click()
        } else {
          await page.keyboard.press('Enter')
        }
      } else {
        throw new Error('無法定位搜尋框')
      }
      
      // 等待載入
      await page.waitForTimeout(2500)
    } catch (e) {
      return [{
        platform: this.platformName,
        name: '❌ 兆宇操作攔截: ' + String(e),
        spec: 'ERROR',
        price: 0,
        unit: 'ERR',
        stock: '請檢查步驟',
        link: page.url()
      }]
    }
    
    // 4. Secondary alert handling (sometimes appears after search)
    const postAlert = await page.$('button.confirm.button')
    if (postAlert) {
      await postAlert.click()
      await page.waitForTimeout(500)
    }

    console.log('[JhaoHong] Waiting for content to appear...')
    try {
      // 終極等待：直接等頁面出現關鍵字
      await page.waitForFunction(() => {
        const t = document.body.innerText;
        return t.includes('健保') || t.includes('產品列表') || t.includes('搜尋結果');
      }, { timeout: 12000 })
      await page.waitForTimeout(2000) 
    } catch (e) {
      return [{
        platform: this.platformName,
        name: '⚠️ 兆宇超時：等不到搜尋結果 (網址: ' + page.url().split('/').pop() + ')',
        spec: 'TIMEOUT',
        price: 0,
        unit: 'WAIT',
        stock: '請確認畫面',
        link: page.url()
      }]
    }

    const results: ProductResult[] = await page.evaluate((platform) => {
      try {
        const cards = Array.from(document.querySelectorAll('li.item, .item'));
        if (cards.length === 0) return [];

        return cards.map((card) => {
          // 1. 品名 (H3)
          const nameEl = card.querySelector('h3');
          const name = nameEl ? nameEl.innerText.trim() : '未知藥品';

          // 2. 健保代碼 (.code.above)
          const codeEl = card.querySelector('.code.above, .code');
          const nhiCode = codeEl ? codeEl.innerText.trim() : '';

          // 3. 健保價 (.red)
          const nhiPriceEl = card.querySelector('.red');
          const nhiPriceText = nhiPriceEl ? nhiPriceEl.innerText.replace(/[^0-9.]/g, '') : '0';
          const nhiPrice = parseFloat(nhiPriceText) || 0;

          // 4. 效期 (.validity)
          const validityEl = card.querySelector('.validity');
          const expiry = validityEl ? validityEl.innerText.replace(/效期\s*[:：]\s*/, '').trim() : '';

          // 5. 售價 (.p)
          const priceEl = card.querySelector('.p');
          const priceText = priceEl ? priceEl.innerText.replace(/[^0-9.]/g, '') : '0';
          const price = parseFloat(priceText) || 0;

          // 6. 單位 (.u)
          const unitEl = card.querySelector('.u');
          const unit = unitEl ? unitEl.innerText.replace(/\//, '').trim() : '單位';

          // 7. 庫存 (.s)
          const stockEl = card.querySelector('.s');
          const stockText = stockEl ? stockEl.innerText.trim() : '';
          const isOutOfStock = stockText.includes('缺貨') || stockText.includes('售完') || card.classList.contains('out');
          const stockStatus = isOutOfStock ? '缺貨中' : (stockText || '有供貨');

          // 8. 單價換算 (從品名找數量，如 28PTP, 30錠)
          let unitPrice: number | undefined = undefined;
          const sizeMatch = name.match(/(\d+)(?:PTP|錠|粒|顆|支|瓶|入)/i);
          if (sizeMatch && price > 0) {
            const size = parseInt(sizeMatch[1]);
            if (size > 0) {
              unitPrice = Math.round((price / size) * 100) / 100;
            }
          }

          return {
            platform,
            name: name,
            spec: '',
            price: price,
            unit: unit,
            unitPrice: unitPrice,
            stock: stockStatus,
            link: window.location.href,
            expiry: expiry,
            nhiCode: nhiCode,
            nhiPrice: nhiPrice
          };
        });
      } catch (err) {
        return [];
      }
    }, this.platformName)

    return results
  }
}
