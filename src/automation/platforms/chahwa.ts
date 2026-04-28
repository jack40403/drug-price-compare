import type { Page, BrowserContext } from 'playwright'
import { Connector } from '../connector'
import type { ProductResult } from '../connector'

export class ChahwaConnector extends Connector {
  platformId = 'chahwa'
  platformName = '嘉鏵'
  baseUrl = 'https://www.chahwa.com.tw/user.php'
  protected context: BrowserContext
  private savedCreds: any = null

  constructor(context: BrowserContext) {
    super(context)
    this.context = context
  }

  /**
   * Override to capture credentials for potential auto-relogin mid-search
   */
  override async ensureLoggedIn(page: Page, creds: any): Promise<boolean> {
    this.savedCreds = creds
    return super.ensureLoggedIn(page, creds)
  }

  async isLoggedIn(page: Page): Promise<boolean> {
    // Look for logout button or welcome message
    const logoutBtn = await page.$('a:has-text("登出")')
    const welcomeMsg = await page.$('font:has-text("歡迎您回到")')
    const isLoggedIn = logoutBtn !== null || welcomeMsg !== null
    console.log(`[Chahwa] Logged in status: ${isLoggedIn}`)
    return isLoggedIn
  }

  async login(page: Page, creds: any): Promise<boolean> {
    console.log('[Chahwa] Performing fresh login (like new window)...')
    // Reset to about:blank to ensure clean state as requested
    await page.goto('about:blank')
    await page.goto(this.baseUrl, { waitUntil: 'networkidle' })
    
    if (await this.isLoggedIn(page)) return true

    console.log('[Chahwa] Opening login modal...')
    const loginTrigger = await page.$('a.gee[href="#login"]')
    if (loginTrigger) {
      await loginTrigger.click()
      await page.waitForTimeout(1000) // Wait for modal animation
    } else {
      console.warn('[Chahwa] Login trigger not found, maybe already visible?')
    }
    
    console.log('[嘉鏵] 正在輸入帳密 (擬人化)...')
    await this.humanType(page, 'input[name="username"]', creds.username)
    await this.humanType(page, 'input[name="password"]', creds.password)
    
    console.log('[Chahwa] Clicking login button...')
    await page.click('a#urlogin_a')
    
    await page.waitForTimeout(4000)
    return await this.isLoggedIn(page)
  }

  async search(page: Page, searchTerm: string): Promise<ProductResult[]> {
    console.log(`[嘉鏵] 正準備發動快速搜尋: "${searchTerm}"`)
    
    // 封裝搜尋輸入邏輯以便重試
    const performSearchStep = async () => {
      await page.goto('https://www.chahwa.com.tw/order.php', { waitUntil: 'networkidle' })
      
      // 檢查是否有廣告彈窗擋住
      const closeBtn = await page.$('a.bl.cancel')
      if (closeBtn) {
        console.log('[嘉鏵] 偵測到廣告，自動清除中...')
        await closeBtn.click()
      }

      const isCode = this.isNHICode(searchTerm)
      const targetSelector = isCode ? 'input[name="hid"]' : 'input[name="drug"]'
      const fieldName = isCode ? '健保碼' : '品名'

      console.log(`[嘉鏵] 執行極速貼上 -> 欄位: ${targetSelector}`)
      await this.fastType(page, targetSelector, searchTerm)
      await page.keyboard.press('Enter')
      
      // 等待結果出現
      await page.waitForSelector('tr:has(a.grpt)', { timeout: 8000 })
    }

    try {
      await performSearchStep()
    } catch (e) {
      console.log('[嘉鏵] 搜尋超時或未見結果，開始進行「曼達特式」Session 完整性校對...')
      
      // 如果 Session 真的掉了
      if (!await this.isLoggedIn(page)) {
        console.log('[嘉鏵] 確認 Session 已過期，啟動補登救援程序...')
        if (this.savedCreds) {
          const loginSuccess = await this.login(page, this.savedCreds)
          if (loginSuccess) {
            console.log('[嘉鏵] 補登成功！自動重啟搜尋流程...')
            try {
              await performSearchStep()
            } catch (retryErr) {
              console.log('[嘉鏵] 重試後仍無結果，判定為無商品。')
              return []
            }
          }
        }
      } else {
        console.log('[嘉鏵] Session 仍有效，判定該關鍵字確實無搜尋結果。')
        return []
      }
    }

    const results: ProductResult[] = await page.evaluate((platform) => {
      const rows = Array.from(document.querySelectorAll('tr:has(a.grpt)'))
      return rows.map((row) => {
        const nameEl = row.querySelector('a.grpt') as HTMLElement
        if (!nameEl) return null

        const rowText = (row as HTMLElement).innerText || ''
        
        // Price is usually in a <font color="red"> or similar inside the table cells
        const priceEl = row.querySelector('font[color="red"], span.red, .red') as HTMLElement | null
        const priceText = priceEl?.innerText.replace(/[^0-9.]/g, '') || '0'
        const price = parseFloat(priceText)
        
        // Extracting specs and stock from the row text
        return {
          platform,
          name: nameEl.innerText.trim(),
          spec: rowText.match(/\d+[\u4e00-\u9fa5]+\/\w+/)?.[0] || 'N/A',
          price: isNaN(price) ? 0 : price,
          unit: 'P',
          stock: rowText.includes('有貨') ? '有貨' : '缺貨',
          link: (nameEl as any).href || window.location.href,
        }
      }).filter(r => r !== null) as ProductResult[]
    }, this.platformName)

    console.log(`[Chahwa] Scraped ${results.length} products.`)
    return results
  }
}
