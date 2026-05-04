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
    return isLoggedIn
  }

  async login(page: Page, creds: any): Promise<boolean> {
    await page.goto(this.baseUrl)
    await this.humanType(page, 'input[placeholder="請輸入帳號"]', creds.username)
    await this.humanType(page, 'input[placeholder="請輸入密碼"]', creds.password)
    await page.click('button.ulogin.yellow')
    await page.waitForTimeout(4000)
    return await this.isLoggedIn(page)
  }

  async search(page: Page, searchTerm: string, filters?: any): Promise<ProductResult[]> {
    await page.goto('https://www.twbingli.com/order.php')
    
    if (page.url().includes('login') || !await this.isLoggedIn(page)) {
      return []
    }

    // 1. 決定注入哪個欄位
    let targetSelector = 'input[name="drug"]' 
    if (filters?.code) {
      targetSelector = 'input[name="hid"]' 
    } else if (filters?.component) {
      targetSelector = 'input[placeholder*="3個字"]' 
    }

    // 2. 注入關鍵字並查詢
    await page.fill(targetSelector, searchTerm)
    await page.click('button.or_query')

    const allResults: ProductResult[] = []
    let pageCount = 1
    const MAX_PAGES = 100 

    while (pageCount <= MAX_PAGES) {
      // 3. 等待當前頁面的資料出現
      try {
        await page.waitForSelector('.name-ingredient', { timeout: 8000 })
        // 多等一下下確保 AJAX 渲染完成
        await page.waitForTimeout(800)
      } catch (e) {
        console.log(`[BinLi] 第 ${pageCount} 頁無資料或載入超時`)
        break
      }

      // 4. 撈取當前頁面資料
      const pageResults: ProductResult[] = await page.evaluate((platform) => {
        const nameElements = document.querySelectorAll('.name-ingredient');
        const products: any[] = [];
        nameElements.forEach((nameEl) => {
          const row = nameEl.parentElement;
          if (!row) return;
          const nameH3 = nameEl.querySelector('h3');
          if (!nameH3) return;
          const name = nameH3.innerText.trim();
          const nhiEl = row.querySelector('.nhi') as HTMLElement;
          const nhiText = nhiEl?.innerText || '';
          const nhiCodeMatch = nhiText.match(/[A-Z0-9]{10}/);
          const nhiCode = nhiCodeMatch ? nhiCodeMatch[0] : '';
          const priceEl = row.querySelector('.price') as HTMLElement;
          const priceText = priceEl ? priceEl.innerText.replace(/[^0-9.]/g, '') : '0';
          const price = parseFloat(priceText) || 0;
          const unitEl = row.querySelector('.unit') as HTMLElement;
          const unit = unitEl ? unitEl.innerText.replace(/[\/\s]/g, '').trim() : '單位';
          if (name && name !== '品名(中英)') {
            products.push({
              platform, name, spec: '', price, unit, stock: '有供貨', link: window.location.href, expiry: '', nhiCode, nhiPrice: 0
            });
          }
        });
        return products;
      }, this.platformName)

      allResults.push(...pageResults)
      console.log(`[BinLi] 第 ${pageCount} 頁抓取完成，目前共 ${allResults.length} 筆`)

      // 5. 偵測並點擊「下一頁」 (使用更精確的選取器避免抓錯格子)
      const nextBtn = await page.$('div.bl.pagination li.r-arrow a.next')
      if (!nextBtn) {
        console.log('[BinLi] 沒找到下一頁箭頭，停止')
        break
      }

      // 檢查是否已到最後一頁 (通常最後一頁點了沒 href 或有 disabled)
      const isLastPage = await page.evaluate(() => {
        const nextLi = document.querySelector('div.bl.pagination li.r-arrow');
        return nextLi?.classList.contains('disabled') || false;
      })

      if (isLastPage) {
        console.log('[BinLi] 已達最後一頁，停止翻頁')
        break
      }

      // 記住當前頁碼，點擊後等待頁碼改變
      const currentPageNum = pageCount;
      console.log(`[BinLi] 正在從第 ${currentPageNum} 頁跳轉至下一頁...`)
      
      await nextBtn.click()
      
      // 6. 精準等待：等待 li.on 的文字不再是當前頁碼
      try {
        await page.waitForFunction((oldPage) => {
          const activePageEl = document.querySelector('.bl.pagination li.on a');
          if (!activePageEl) return false;
          const newPage = parseInt(activePageEl.textContent || '0');
          return newPage > oldPage;
        }, currentPageNum, { timeout: 8000 });
        
        pageCount++;
      } catch (e) {
        console.log('[BinLi] 翻頁等待超時，可能已到末頁或網路延遲')
        break
      }
    }

    console.log(`[BinLi] 全部抓取完成，共 ${allResults.length} 筆`)
    return allResults
  }
}
