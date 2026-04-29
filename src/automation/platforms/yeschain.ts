import type { Page, BrowserContext } from 'playwright'
import { Connector } from '../connector'
import type { ProductResult } from '../connector'

/**
 * YesChainConnector (好鄰居 / 躍獅)
 * 採用曼達特模式：自動填寫預留驗證碼手動輸入時間
 */
export class YesChainConnector extends Connector {
  platformId = 'yeschain'
  platformName = '好鄰居 (躍獅)'
  baseUrl = 'https://www.yeschain.com.tw/b2bStoreCart/login'

  protected context: BrowserContext
  constructor(context: BrowserContext) {
    super(context)
    this.context = context
  }

  async isLoggedIn(page: Page): Promise<boolean> {
    try {
      const url = page.url()
      // 只用網址判定，避免靜態文字「歡迎您」誤判
      if (url.includes('b2bStoreCart/login') || url === 'about:blank') return false
      return url.includes('b2bStoreCart/otcProd') ||
             url.includes('b2bStoreCart/prod') ||
             url.includes('b2bStoreCart/order')
    } catch (e) {
      return false
    }
  }

  async login(page: Page, creds: any): Promise<boolean> {
    console.log('[好鄰居] 正在導向登入頁面...')
    await page.goto(this.baseUrl, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1000)

    if (await this.isLoggedIn(page)) return true

    try {
      console.log('[好鄰居] 嘗試自動輸入帳密...')
      await this.humanType(page, 'input#email, input[type="email"], input[name="email"]', creds.username)
      await this.humanType(page, 'input#password, input[type="password"]', creds.password)
    } catch (e) {
      console.warn('[好鄰居] 自動輸入帳密失敗，請手動輸入:', e)
    }

    try {
      console.log('[好鄰居] 請在視窗中輸入驗證碼並登入 (監控中)...')

      // 登入後頁面出現 b2bStoreCart/home 連結，是 AJAX 登入成功的唯一 DOM 指標
      await page.waitForFunction(
        () => !!document.querySelector('a[href*="b2bStoreCart/home"]'),
        { timeout: 300000 }
      )

      console.log('[好鄰居] 偵測到登入成功，自動點擊 Your Company 進入會員區...')
      await page.locator('a[href*="b2bStoreCart/home"]').first().click()
      await page.waitForTimeout(2000)
      console.log(`[好鄰居] 登入完成，落地頁: ${page.url()}`)
      console.log('[好鄰居] 交由搜尋流程接手。')
    } catch (e) {
      console.warn('[好鄰居] 登入等待超時或跳轉失敗:', e)
    }

    return true
  }

  async search(page: Page, searchTerm: string): Promise<ProductResult[]> {
    console.log(`[好鄰居] 正準備搜尋: "${searchTerm}"`)
    const isCode = this.isNHICode(searchTerm)

    // 導航至 prod，部分帳號會被 redirect 至 otcProd
    await page.goto('https://www.yeschain.com.tw/b2bStoreCart/prod', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(800)

    const landedUrl = page.url()
    console.log(`[好鄰居] 落地頁: ${landedUrl}`)

    if (landedUrl.includes('b2bStoreCart/login')) {
      console.warn('[好鄰居] 被導向登入頁，session 已過期，停止搜尋')
      return []
    }

    // 依落地頁決定 selector
    let targetSelector: string
    if (landedUrl.includes('otcProd')) {
      // otcProd 只有一個通用搜尋框
      targetSelector = 'input[placeholder*="輸入商品名稱或貨號"]'
      console.log('[好鄰居] 偵測到 otcProd，使用通用搜尋框')
    } else {
      targetSelector = isCode
        ? 'input[placeholder*="健保碼至少5個字"]'
        : 'input[placeholder*="品名至少2個字"]'
      console.log(`[好鄰居] 使用 prod 搜尋框: ${targetSelector}`)
    }

    try {
      await page.waitForSelector(targetSelector, { state: 'visible', timeout: 15000 })

      await this.fastType(page, targetSelector, searchTerm)

      console.log('[好鄰居] 輸入完成，執行 Enter 觸發搜尋...')
      await page.keyboard.press('Enter')

      await page.waitForTimeout(500)
      const queryBtn = page.locator(targetSelector).locator('xpath=following-sibling::button | following-sibling::span//button').first()
      if (await queryBtn.isVisible().catch(() => false)) {
        console.log('[好鄰居] 執行精確點擊搜尋鈕...')
        await queryBtn.click({ delay: 100 })
      }

      console.log('[好鄰居] 等待搜尋結果載入...')
      await page.waitForTimeout(2000)
    } catch (e) {
      console.warn(`[好鄰居] 搜尋流程發生異常:`, e)
      return []
    }

    // 6. 解析搜尋結果
    const results: ProductResult[] = await page.evaluate((platform) => {
      const items = Array.from(document.querySelectorAll('tbody tr'))
      return items.map((item) => {
        const nameEl = item.querySelector('td:nth-child(4)') as HTMLElement | null
        const priceSelect = item.querySelector('select') as HTMLSelectElement | null
        const specEl = item.querySelector('td:nth-child(6)') as HTMLElement | null

        if (!nameEl) return null

        let price = 0
        if (priceSelect && priceSelect.options.length > 0) {
          const priceText = priceSelect.options[priceSelect.selectedIndex]?.text || ''
          const match = priceText.match(/[\d,]+/)
          if (match) price = parseFloat(match[0].replace(/,/g, ''))
        }

        return {
          platform,
          name: nameEl.innerText.trim(),
          spec: specEl?.innerText.trim() || '',
          price: price,
          unit: 'P',
          stock: item.innerText.includes('缺貨') ? '缺貨' : '有貨',
          link: window.location.href,
        }
      }).filter(r => r !== null && r.price > 0) as ProductResult[]
    }, this.platformName)

    return results
  }
}
