// Coda Connector (可達藥品有限公司)
import type { Page, BrowserContext } from 'playwright'
import { Connector } from '../connector'
import type { ProductResult } from '../connector'

export class CodaConnector extends Connector {
  platformId = 'coda'
  platformName = '可達'
  baseUrl = 'https://www.codadrug.com.tw/'

  protected context: BrowserContext
  constructor(context: BrowserContext, captchaHandler?: (platformId: string, platformName: string, image: string) => Promise<string>) {
    super(context, captchaHandler)
    this.context = context
  }

  // ── Session check ──────────────────────────────────────────────
  async isLoggedIn(page: Page): Promise<boolean> {
    try {
      const url = page.url()
      // 只要進入首頁、產品頁或訂單頁，即視為登入成功
      return url.includes('/Home/Index') || url.includes('/Product/') || url.includes('/Order/')
    } catch (e) {
      return false
    }
  }

  async login(page: Page, creds: any): Promise<boolean> {
    console.log('[可達] 正在導向登入頁面...')
    await page.goto(this.baseUrl, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1000)

    if (await this.isLoggedIn(page)) return true

    console.log('[可達] 正在輸入帳密 (擬人化)...')
    await this.humanType(page, 'input#Account', creds.username)
    await this.humanType(page, 'input#Password', creds.password)
    await page.click('input#Submit')

    // 等待跳轉，縮短超時時間並增加靈活性
    try {
      await page.waitForFunction(() => {
        const url = window.location.href
        return url.includes('/Home/Index') || url.includes('/Product/')
      }, { timeout: 15000 })
    } catch (e) {
      console.warn('[可達] 登入跳轉緩慢，繼續嘗試下一步...')
    }

    return await this.isLoggedIn(page)
  }

  async search(page: Page, searchTerm: string, filters?: any): Promise<ProductResult[]> {
    console.log(`[可達] 執行穩定版搜尋: "${searchTerm}", Filters: ${JSON.stringify(filters)}`)

    // 直接跳轉到產品區域
    if (!page.url().includes('/Product/Product')) {
      await page.goto('https://www.codadrug.com.tw/Product/Product', { waitUntil: 'domcontentloaded' })
    }

    try {
      // 1. [自動開啟搜尋框] 點選放大鏡或搜尋標籤
      const searchTrigger = page.locator('i.fa-search, label[for="SearchInput"], .search-icon').first()
      await searchTrigger.scrollIntoViewIfNeeded()
      await searchTrigger.click()
      await page.waitForTimeout(300)

      // 2. [極速輸入]
      const searchInput = 'input#SearchInput'
      console.log('[可達] 執行極速貼入搜尋...')
      await this.fastType(page, searchInput, searchTerm)
      await page.keyboard.press('Enter')

      // 3. 等待清單載入
      await page.waitForSelector('a.item', { timeout: 10000 })
    } catch (e) {
      console.warn('[可達] 搜尋控制項操作失靈:', e)
      return []
    }

    // ── Parse result cards ───────────────────────────────────────
    const results: ProductResult[] = await page.evaluate((platform) => {
      // 可達的卡片通常是 a.item
      const items = Array.from(document.querySelectorAll('a.item, .item'))
      return items.map((item) => {
        const text = (item as HTMLElement).innerText;
        if (!text.includes('藥品名稱')) return null;

        const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

        // 1. 健保序號與健保價
        const nhiCodeMatch = text.match(/健保碼[：:]\s*([A-Z0-9]{10})/);
        const nhiCode = nhiCodeMatch ? nhiCodeMatch[1] : '';
        
        const nhiPriceMatch = text.match(/健保價[：:]\s*([\d,.]+)/);
        const nhiPrice = nhiPriceMatch ? parseFloat(nhiPriceMatch[1].replace(/,/g, '')) : 0;

        // 2. 品名
        const nameMatch = text.match(/藥品名稱[：:]\s*([^\n]+)/);
        const name = nameMatch ? nameMatch[1].trim() : (lines[2] || '未知藥品');

        // 3. 售價 (總價 / 單價)
        // 格式範例: "193 / 7.3"
        const pricePatternMatch = text.match(/([\d,.]+)\s*\/\s*([\d,.]+)/);
        const price = pricePatternMatch ? parseFloat(pricePatternMatch[1].replace(/,/g, '')) : 0;
        const unitPrice = pricePatternMatch ? parseFloat(pricePatternMatch[2].replace(/,/g, '')) : 0;

        // 4. 單位
        const unitMatch = text.match(/單位[：:]\s*(\S+)/);
        const unit = unitMatch ? unitMatch[1] : '單位';

        // 5. 庫存
        const isOutOfStock = text.includes('缺貨') || text.includes('售完');
        const stockStatus = isOutOfStock ? '缺貨中' : '有庫存';

        return {
          platform,
          name: name,
          spec: lines[0]?.replace('藥品編號:', '').trim() || '',
          price: isNaN(price) ? 0 : price,
          unitPrice: isNaN(unitPrice) ? 0 : unitPrice,
          unit: unit,
          stock: stockStatus,
          link: (item as HTMLAnchorElement).href || window.location.href,
          expiry: '',
          nhiCode: nhiCode,
          nhiPrice: isNaN(nhiPrice) ? 0 : nhiPrice
        }
      }).filter((r) => r !== null) as ProductResult[]
    }, this.platformName)

    return results
  }
}
