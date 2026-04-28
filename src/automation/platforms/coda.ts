// Coda Connector (可達藥品有限公司)
import type { Page, BrowserContext } from 'playwright'
import { Connector } from '../connector'
import type { ProductResult } from '../connector'

export class CodaConnector extends Connector {
  platformId = 'coda'
  platformName = '可達'
  baseUrl = 'https://www.codadrug.com.tw/'

  protected context: BrowserContext
  constructor(context: BrowserContext) {
    super(context)
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

  async search(page: Page, searchTerm: string): Promise<ProductResult[]> {
    console.log(`[可達] 執行穩定版搜尋: "${searchTerm}"`)

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
      const items = Array.from(document.querySelectorAll('a.item'))
      return items.map((item) => {
        const tbl = item.querySelector('table')
        if (!tbl) return null
        const rows = tbl.querySelectorAll('tr')

        // Row 1: drug code | stock status
        const row1cols = rows[0]?.querySelectorAll('td')
        const stockEl = row1cols?.[1]?.querySelector('label') as HTMLElement | null
        const stock = stockEl?.innerText.trim() || '未知'

        // Row 2: drug name | price "boxPrice / unitPrice"
        const row2cols = rows[1]?.querySelectorAll('td')
        const nameEl = row2cols?.[0]?.querySelector('label') as HTMLElement | null
        const priceEl = row2cols?.[1]?.querySelector('label') as HTMLElement | null
        const priceRaw = priceEl?.innerText.trim() || '0'
        // "1320 / 1.4" → take the first number (package price)
        const priceMatch = priceRaw.match(/[\d,]+(\.\d+)?/)
        const price = priceMatch ? parseFloat(priceMatch[0].replace(/,/g, '')) : 0

        // Row 3: NHI code + unit | NHI price
        const row3cols = rows[2]?.querySelectorAll('td')
        const row3text = (row3cols?.[0] as HTMLElement)?.innerText || ''
        // e.g. "健保碼：AC373441G0 單位：排"
        const unitMatch = row3text.match(/單位[：:]\s*(\S+)/)
        const unit = unitMatch?.[1] || 'P'
        // NHI code only (strip unit part)
        const nhiCode = row3text.replace(/單位[：:]\s*\S+/, '').trim()

        return {
          platform,
          name: nameEl?.innerText.trim() || '未知藥品',
          spec: nhiCode,
          price,
          unit,
          stock,
          link: (item as HTMLAnchorElement).href || window.location.href,
        }
      }).filter((r) => r !== null) as ProductResult[]
    }, this.platformName)

    // 為保持儀表板整潔，已根據要求暫時關閉資料傳回功能
    return []
  }
}
