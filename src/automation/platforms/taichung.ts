import type { Page } from 'playwright'
import { Connector } from '../connector'
import type { ProductResult } from '../connector'

export class TaichungConnector extends Connector {
  platformId = 'taichung'
  platformName = '泰昌藥品'
  baseUrl = 'https://taichung-pc.com.tw/index.php'

  async isLoggedIn(page: Page): Promise<boolean> {
    const loginBtn = await page.$('a.signin.gosign')
    const isLoggedIn = loginBtn === null
    console.log(`[Taichung] Logged in status: ${isLoggedIn}`)
    return isLoggedIn
  }

  async login(page: Page, creds: any): Promise<boolean> {
    console.log('[Taichung] Navigating to home page...')
    await page.goto(this.baseUrl, { waitUntil: 'domcontentloaded' })

    if (await this.isLoggedIn(page)) return true

    console.log('[Taichung] Opening login modal...')
    await page.click('a.signin.gosign')
    await page.waitForTimeout(1000)

    console.log('[泰昌] 正在輸入帳密 (擬人化)...')
    await this.humanType(page, "input[placeholder='請輸入登入帳號']", creds.username)
    await this.humanType(page, "input[placeholder='請輸入登入密碼']", creds.password)

    console.log('[Taichung] Clicking login button...')
    await page.click('a#ulogin_submit')

    await page.waitForTimeout(4000)

    const success = await this.isLoggedIn(page)
    if (!success) {
      console.warn('[Taichung] Login attempt failed.')
    }
    return success
  }

  async search(page: Page, searchTerm: string): Promise<ProductResult[]> {
    console.log(`[泰昌] 正準備搜尋: "${searchTerm}"`)
    const isCode = this.isNHICode(searchTerm)
    const targetUrl = 'https://taichung-pc.com.tw/order.php?act=order'
    const targetSelector = isCode ? 'input[name="hid"]' : 'input[name="drug"]'
    const fieldName = isCode ? '健保碼' : '品名'

    console.log(`[泰昌] ===============================`)
    console.log(`[泰昌] 判定結果: ${fieldName}`)
    console.log(`[泰昌] 動作: 跳轉至訂購頁並填入 ${fieldName} 欄位`)
    console.log(`[泰昌] ===============================`)

    // 1. 強力跳轉至訂購搜尋頁 (不論目前在哪)
    if (!page.url().includes('order.php?act=order')) {
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded' })
    }

    try {
      await page.waitForSelector(targetSelector, { timeout: 8000 })
      
      // 2. 極速貼入 (瞬間完成搜尋填報)
      console.log(`[泰昌] 執行極速貼入 -> 欄位: ${targetSelector}`)
      await this.fastType(page, targetSelector, searchTerm)
      
      // 3. 執行搜尋
      console.log(`[泰昌] 正在點擊搜尋按鈕...`)
      await page.click('button.search.button')
      
      console.log('[泰昌] 等待搜尋結果載入...')
      await page.waitForTimeout(2000)
    } catch (e) {
      console.warn(`[泰昌] ${fieldName} 搜尋流程發生異常:`, e)
      return []
    }

    console.log('[Taichung] Waiting for results...')
    try {
      // Results are usually in rows with class 'order_row' or similar
      await page.waitForSelector('.order_list_item, .order_row, tr:has(.drug_name)', { timeout: 8000 })
    } catch (e) {
      console.log('[Taichung] Timeout waiting for results or no matches found.')
      return []
    }

    const results: ProductResult[] = await page.evaluate((platform) => {
      // Logic based on typical structure of similar Taiwanese B2B pharmacy sites
      const items = Array.from(document.querySelectorAll('.order_list_item, .order_row, tr:has(.drug_name)'))
      if (items.length === 0) return []

      return items.map((item) => {
        const nameEl = item.querySelector('.drug_name, .title, .name') as HTMLElement
        if (!nameEl) return null

        const name = nameEl.innerText.trim()
        const link = (item.querySelector('a') as HTMLAnchorElement)?.href || window.location.href

        const priceEl = item.querySelector('.price, .unit_price, .red, font[color="red"]') as HTMLElement
        const priceText = priceEl?.innerText.replace(/[^0-9.]/g, '') || '0'
        const price = parseFloat(priceText)
        
        const stockEl = item.querySelector('.stock, .inventory, .status') as HTMLElement
        const stock = stockEl?.innerText.trim() || '有貨'

        const specEl = item.querySelector('.spec, .package, .dosage') as HTMLElement
        const spec = specEl?.innerText.trim() || ''

        return {
          platform,
          name: name,
          spec: spec,
          price: isNaN(price) ? 0 : price,
          unit: '袋/盒',
          stock: stock,
          link: link,
        }
      }).filter(r => r !== null && r.name) as ProductResult[]
    }, this.platformName)

    console.log(`[Taichung] Scraped ${results.length} products.`)
    return results
  }
}
