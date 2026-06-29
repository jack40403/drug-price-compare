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

  private async waitForLoggedInState(page: Page, timeoutMs = 10000): Promise<boolean> {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      if (await this.isLoggedIn(page)) return true
      await page.waitForTimeout(400)
    }
    return false
  }

  async isLoggedIn(page: Page): Promise<boolean> {
    try {
      // 關鍵修正：不能檢查「會員中心」，因為它在頁尾始終存在 (False Positive)
      // 優先檢查可見的登出入口，再用頁面文字做保底
      const logoutTrigger = page
        .locator('a:has-text("會員登出"), button:has-text("會員登出"), [href*="logout"], [onclick*="logout"]')
        .first()
      if (await logoutTrigger.isVisible().catch(() => false)) {
        console.log('[宇盛] 登入狀態檢查: true (logout trigger visible)')
        return true
      }

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
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        await page.goto(this.baseUrl, { waitUntil: 'domcontentloaded' })
        await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {})

        if (await this.isLoggedIn(page)) return true

        console.log('[宇盛] 正在觸發會員登入彈窗...')

        // 1. 偵測並點選「漢堡選單」(手機版寬度)
        const menuToggler = page.locator('button.navbar-toggler, i.fa-bars, .navbar-toggle').first()
        if (await menuToggler.isVisible().catch(() => false)) {
          console.log('[宇盛] 偵測到手機版選單，正在開啟...')
          await menuToggler.click({ force: true })
          await page.waitForTimeout(500)
        }

        // 2. 點選「會員登入」按鈕
        const loginTrigger = page
          .locator('a:has-text("會員登入"), button:has-text("會員登入"), span:has-text("會員登入"), [href*="login"]')
          .first()
        await loginTrigger.waitFor({ state: 'visible', timeout: 10000 })
        await loginTrigger.click({ force: true })

        // 3. 等待登入彈窗真正出現
        console.log('[宇盛] 等待登入彈窗...')
        const accountInput = page
          .locator('input[name="account"], input[name="username"], input#account, input[placeholder*="帳號"]')
          .first()
        await accountInput.waitFor({ state: 'visible', timeout: 10000 })

        console.log('[宇盛] 正在擬人化輸入帳密...')
        await this.fastType(page, 'input[name="account"], input[name="username"], input#account, input[placeholder*="帳號"]', creds.username)
        await this.fastType(page, 'input[name="pwd"], input[name="password"], input[type="password"]', creds.password)

        // 4. 提交登入並等待狀態穩定
        const submitBtn = page
          .locator('#ulogin_submit2, button:has-text("登入"), input[type="submit"]')
          .first()
        await submitBtn.click({ force: true })

        await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {})
        if (await this.waitForLoggedInState(page, 10000)) return true
      } catch (e) {
        console.error(`[宇盛] 第 ${attempt} 次登入流程失敗:`, e)
      }

      if (attempt < 2) {
        console.log('[宇盛] 登入未穩定，準備重試一次...')
        await page.waitForTimeout(1000)
      }
    }

    return await this.isLoggedIn(page)
  }

  async search(page: Page, searchTerm: string, filters?: any): Promise<ProductResult[]> {
    console.log(`[宇盛] 正準備發動搜尋: "${searchTerm}", Filters: ${JSON.stringify(filters)}`)
    
    try {
      await page.goto('https://www.yusheng0307.com/product.html', { waitUntil: 'networkidle' })
      console.log('[宇盛] 執行極速貼入搜尋...')
      await this.fastType(page, 'input[name="keyword"]', searchTerm)
      await page.keyboard.press('Enter')
      
      await page.waitForSelector('a.text-info, .text-outofstock', { timeout: 8000 })
      await page.waitForTimeout(1500)
    } catch (e) {
      console.log('[宇盛] 搜尋逾時或無結果')
      return []
    }

    const allResults: ProductResult[] = []
    let pageCount = 1
    const MAX_PAGES = 50

    while (pageCount <= MAX_PAGES) {
      try {
        await page.waitForSelector('li.d-lg-block', { timeout: 8000 })
        await page.waitForTimeout(500)
      } catch (e) {
        console.log(`[宇盛] 第 ${pageCount} 頁無資料或載入超時`)
        break
      }

      const pageResults: ProductResult[] = await page.evaluate((platform) => {
        try {
          const rows = Array.from(document.querySelectorAll('li.d-lg-block')).filter(row => {
            return row.querySelector('a.text-info') !== null && !row.innerText.includes('產品圖');
          });

          if (rows.length === 0) return [];

          return rows.map((row) => {
            const rowText = (row as HTMLElement).innerText;

            const nameEl = row.querySelector('.fw-bolder');
            const name = nameEl ? nameEl.innerText.trim() : '未知藥品';

            const nhiEl = row.querySelector('a.text-info');
            const nhiCode = nhiEl ? nhiEl.innerText.trim() : '';

            const nhiPriceMatch = rowText.match(/健保價\s*[:：]\s*([\d,.]+)/);
            const nhiPrice = nhiPriceMatch ? parseFloat(nhiPriceMatch[1].replace(/,/g, '')) : 0;

            const priceEl = row.querySelector('span.fs-5');
            const price = priceEl ? parseFloat(priceEl.innerText.replace(/[^0-9.]/g, '')) : 0;

            const priceAreaText = priceEl?.parentElement?.innerText || '';
            const unitMatch = priceAreaText.match(/\/\s*([^\n\s：:]+)/);
            const unit = unitMatch ? unitMatch[1].trim() : '單位';

            const isOutOfStock = row.querySelector('.text-outofstock') !== null;
            const stock = isOutOfStock ? '缺貨中' : '有供貨';

            const expiryMatch = rowText.match(/(\d{4}[-/]\d{2}[-/]\d{2})/);
            const expiry = expiryMatch ? expiryMatch[1] : '';

            let unitPrice: number | undefined = undefined;
            const sizeMatch = name.match(/(\d+)(?:PTP|錠|粒|顆|支|瓶|入|T)/i);
            if (sizeMatch && price > 0) {
              const size = parseInt(sizeMatch[1]);
              if (size > 0) unitPrice = Math.round((price / size) * 100) / 100;
            }

            return { platform, name, spec: '', price, unit, unitPrice, stock, link: window.location.href, expiry, nhiCode, nhiPrice };
          });
        } catch (e) {
          return [];
        }
      }, this.platformName)

      if (pageResults.length === 0) break
      allResults.push(...pageResults)
      console.log(`[宇盛] 第 ${pageCount} 頁抓取完成，目前共 ${allResults.length} 筆`)

      const nextBtn = await page.$('a.page-link[aria-label="Next"]')
      if (!nextBtn) {
        console.log('[宇盛] 已達最後一頁，停止翻頁')
        break
      }

      await nextBtn.click()

      try {
        await page.waitForFunction((oldPage) => {
          const activeEl = document.querySelector('li.page-item.active a.page-link')
          return activeEl ? parseInt(activeEl.textContent || '0') > oldPage : false
        }, pageCount, { timeout: 8000 })
        pageCount++
      } catch (e) {
        console.log('[宇盛] 翻頁等待超時，停止')
        break
      }
    }

    console.log(`[宇盛] 全部抓取完成，共 ${allResults.length} 筆`)
    return allResults
  }
}
