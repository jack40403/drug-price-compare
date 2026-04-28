import type { Page, BrowserContext } from 'playwright'
import { Connector } from '../connector'
import type { ProductResult } from '../connector'

export class YuShengConnector extends Connector {
  platformId = 'yusheng'
  platformName = '宇盛'
  baseUrl = 'https://www.yusheng0307.com/'

  protected context: BrowserContext
  constructor(context: BrowserContext) {
    super(context)
    this.context = context
  }

  async isLoggedIn(page: Page): Promise<boolean> {
    try {
      // 關鍵修正：不能檢查「會員中心」，因為它在頁尾始終存在 (False Positive)
      // 必須精確偵測「會員登出」字樣
      const bodyText = await page.textContent('body')
      const isLoggedIn = bodyText?.includes('會員登出') || false
      console.log(`[宇盛] 登入狀態檢查: ${isLoggedIn}`)
      return isLoggedIn
    } catch (e) {
      return false
    }
  }

  async login(page: Page, creds: any): Promise<boolean> {
    console.log('[宇盛] 偵測目前連線狀態...')
    await page.goto(this.baseUrl, { waitUntil: 'networkidle' })
    
    if (await this.isLoggedIn(page)) return true

    console.log('[宇盛] 正在觸發會員登入彈窗...')
    try {
      // 1. 偵測並點選「漢堡選單」 (手機版寬度)
      const menuToggler = page.locator('button.navbar-toggler, i.fa-bars, .navbar-toggle').first()
      if (await menuToggler.isVisible()) {
        console.log('[宇盛] 偵測到手機版選單，正在開啟...')
        await menuToggler.click({ force: true })
        await page.waitForTimeout(800) // 等待選單展開動畫
      }

      // 2. 點選「會員登入」按鈕
      const loginTrigger = page.locator('a:has-text("會員登入"), button:has-text("會員登入"), span:has-text("會員登入")').first()
      await loginTrigger.waitFor({ state: 'visible', timeout: 5000 })
      await loginTrigger.click({ force: true })
      
      // 3. 關鍵：等待登入彈窗動畫跑完
      console.log('[宇盛] 等待登入彈窗動畫...')
      await page.waitForTimeout(1200) 
      
      // 4. 定位於帳號輸入框 (改用更廣泛的選取器以應對 Modal)
      const accountInput = page.locator('input[name="account"], input[placeholder*="帳號"]').first()
      await accountInput.waitFor({ state: 'visible', timeout: 5000 })
      
      console.log('[宇盛] 正在擬人化輸入帳密...')
      await this.humanType(page, 'input[name="account"]', creds.username)
      await this.humanType(page, 'input[name="pwd"]', creds.password)
      
      // 5. 點擊登入提交
      await page.click('#ulogin_submit2', { force: true })
      
      // 等待 Session 建立
      await page.waitForTimeout(2000)
    } catch (e) {
      console.error('[宇盛] 觸發登入流程失敗:', e)
    }
    
    return await this.isLoggedIn(page)
  }

  async search(page: Page, searchTerm: string): Promise<ProductResult[]> {
    console.log(`[宇盛] 正準備發動搜尋: "${searchTerm}"`)
    
    try {
      // 宇盛搜尋需要確保在產品頁或從首頁輸入
      await page.goto('https://www.yusheng0307.com/product.html', { waitUntil: 'networkidle' })
      // 使用極速貼上搜尋關鍵字
      console.log('[宇盛] 執行極速貼入搜尋...')
      await this.fastType(page, 'input[name="keyword"]', searchTerm)
      await page.keyboard.press('Enter')
      
      // 等待結果渲染
      await page.waitForSelector('div.row.border.rounded', { timeout: 10000 })
    } catch (e) {
      console.log('[宇盛] 搜尋無結果:', e)
      return []
    }

    const results: ProductResult[] = []
    
    const cards = await page.$$('div.row.border.rounded.mb-3')
    for (const card of cards) {
      try {
        const name = (await card.$eval('p.fw-bolder.mb-0', el => el.textContent))?.trim() || ''
        const nhiCode = (await card.$eval('a.hvr-grow', el => el.textContent))?.trim() || ''
        
        // 價格與單位通常在一個 span 內，格式如 "750 / 盒"
        const priceText = (await card.$eval('span.fw-bolder.fs-5.text-primary', el => el.textContent))?.trim() || ''
        const priceMatch = priceText.match(/(\d+)\s*\/\s*(.+)/)
        const priceValue = priceMatch ? parseInt(priceMatch[1]) : 0
        const unitValue = priceMatch ? priceMatch[2].trim() : ''

        // 偵測庫存狀態
        const isOutOfStock = (await card.$('.text-outofstock')) !== null
        const stockStatus = isOutOfStock ? '缺貨中' : '供貨中'

        results.push({
          platform: '宇盛',
          name: name,
          spec: nhiCode ? `[${nhiCode}]` : '',
          price: priceValue,
          unit: unitValue,
          stock: stockStatus
        })
      } catch (e) {
        continue
      }
    }

    return results
  }
}
