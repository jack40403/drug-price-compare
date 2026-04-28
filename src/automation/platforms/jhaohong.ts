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

  async search(page: Page, searchTerm: string): Promise<ProductResult[]> {
    console.log(`[JhaoHong] 執行常駐搜尋框搜尋: "${searchTerm}"`)
    
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

        // 3. 自動分流：偵測內容並切換搜尋模式 (名稱 vs 健保碼)
        const isCode = this.isNHICode(searchTerm)
        const filterValue = isCode ? 'nhi' : 'name'
        console.log(`[兆宇] 偵測到${isCode ? '健保碼' : '品名'}格式，自動切換模式為: ${filterValue}`)
        
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
        await page.keyboard.press('Enter')
        
        // 4. 點擊搜尋按鈕
        const btn = await page.$('button.multi.search')
        if (btn) {
          await btn.click()
        } else {
          await page.keyboard.press('Enter')
        }
      } else {
        throw new Error('無法定位搜尋框')
      }
      
      // 等待載入
      await page.waitForTimeout(2500)
    } catch (e) {
      console.warn('[JhaoHong] Interaction failed:', e)
      return []
    }
    
    // 4. Secondary alert handling (sometimes appears after search)
    const postAlert = await page.$('button.confirm.button')
    if (postAlert) {
      await postAlert.click()
      await page.waitForTimeout(500)
    }

    console.log('[JhaoHong] Waiting for product items...')
    try {
      await page.waitForSelector('ul.items li .inner', { timeout: 8000 })
    } catch (e) {
      console.log('[JhaoHong] No products found after search.')
      return []
    }

    const results: ProductResult[] = await page.evaluate((platform) => {
      const items = Array.from(document.querySelectorAll('ul.items li .inner'))
      if (items.length === 0) return []

      return items.map((item) => {
        const nameEl = item.querySelector('.product.ingredients h3') as HTMLElement | null
        const priceEl = item.querySelector('.price.unit.R .p') as HTMLElement | null
        const unitEl = item.querySelector('.price.unit.R .u') as HTMLElement | null
        const stockEl = item.querySelector('.controlled-drugs.stock.C .s') as HTMLElement | null
        const specEl = item.querySelector('.validity') as HTMLElement | null

        if (!nameEl) return null

        const priceText = priceEl?.innerText.replace(/[^0-9.]/g, '') || '0'
        const price = parseFloat(priceText)

        return {
          platform,
          name: nameEl.innerText.trim(),
          spec: specEl?.innerText.trim() || '',
          price: isNaN(price) ? 0 : price,
          unit: unitEl?.innerText.trim().replace('/', '') || 'P',
          stock: stockEl?.innerText.trim() || '未知',
          link: window.location.href,
        }
      }).filter(r => r !== null) as ProductResult[]
    }, this.platformName)

    // 為保持儀表板整潔，已根據要求暫時關閉資料傳回功能
    return []
  }
}
