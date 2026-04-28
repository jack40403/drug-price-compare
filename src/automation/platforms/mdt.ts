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

      // 等待清單載入
      await page.waitForSelector('.productBox', { timeout: 8000 })
    } catch (e) {
      console.warn('[蔓達特] 搜尋過程中發生錯誤:', e)
      return []
    }

    const results: ProductResult[] = await page.evaluate((platform) => {
      const boxes = Array.from(document.querySelectorAll('.productBox'))
      return boxes.map(box => {
        const nameEl = box.querySelector('.productTitle') as HTMLElement
        const priceEl = box.querySelector('.wd') as HTMLElement // 價格通常在此
        const specEl = box.querySelector('.spec') as HTMLElement // 規格

        if (!nameEl) return null

        const name = nameEl.innerText.trim()
        const priceText = priceEl?.innerText.replace(/[^0-9.]/g, '') || '0'
        const price = parseFloat(priceText)

        return {
          platform,
          name: name,
          spec: specEl?.innerText.trim() || '',
          price: isNaN(price) ? 0 : price,
          unit: 'P',
          stock: '有貨', // 蔓達特顯示在列表中通常代表有貨
          link: window.location.href
        }
      }).filter(r => r !== null) as ProductResult[]
    }, this.platformName)

    return results
  }
}
