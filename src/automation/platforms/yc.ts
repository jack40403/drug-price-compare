import type { Page } from 'playwright'
import { Connector } from '../connector'
import type { ProductResult } from '../connector'

export class YCConnector extends Connector {
  platformId = 'yc'
  platformName = '益全生技'
  baseUrl = 'https://ycmedicine.com.tw'

  async isLoggedIn(page: Page): Promise<boolean> {
    // Check if the "會員登入" or sign-in link is present.
    // If we see a "登出" (Logout) or a member icon, we are logged in.
    const loginLink = await page.$('a[href*="/sign/in/in.html"]')
    const isLoggedIn = loginLink === null
    console.log(`[YC] Logged in status: ${isLoggedIn}`)
    return isLoggedIn
  }

  async login(page: Page, creds: any): Promise<boolean> {
    console.log('[YC] Navigating to login page...')
    // Correct login URL discovered during research
    await page.goto(`${this.baseUrl}/sign/in/in.html`, { waitUntil: 'networkidle' })

    console.log('[YC] Filling credentials (human-like delays)...')
    // Use specific IDs confirmed by research
    const userField = 'input#account_login'
    const passField = 'input#password_login'
    
    await page.waitForSelector(userField, { timeout: 10000 })
    console.log('[益全] 正在填寫帳密...')
    await this.humanType(page, userField, creds.username)
    await this.humanType(page, passField, creds.password)

    console.log('[YC] Clicking login button...')
    await page.click('button#submit-btn')

    // Wait for navigation or modal to close
    await page.waitForTimeout(2000)

    const success = await this.isLoggedIn(page)
    if (!success) {
      console.warn('[YC] Login attempt failed. Verify your credentials in Settings.')
    }
    return success
  }

  async search(page: Page, searchTerm: string): Promise<ProductResult[]> {
    console.log(`[YC] Searching for: "${searchTerm}"`)

    // Ensure we are on the product listing page
    if (!page.url().includes('/product/all/index.html')) {
      await page.goto(`${this.baseUrl}/product/all/index.html`, { waitUntil: 'domcontentloaded' })
    }

    // Check for login redirect
    if (page.url().includes('login') || !await this.isLoggedIn(page)) {
      console.log('[YC] Not logged in or session expired, skipping search.')
      return []
    }

    console.log(`[益全] 正準備搜尋: "${searchTerm}"`)
    const isCode = this.isNHICode(searchTerm)
    const targetSelector = isCode ? 'input[name="code"]' : 'input[name="product_name"]'
    const fieldName = isCode ? '健保碼' : '品名'

    console.log(`[益全] ===============================`)
    console.log(`[益全] 關鍵字: "${searchTerm}"`)
    console.log(`[益全] 判定結果: ${fieldName}`)
    console.log(`[益全] 動作: 填入 ${fieldName} 欄位 (${targetSelector})`)
    console.log(`[益全] ===============================`)

    await page.waitForSelector(targetSelector)
    console.log(`[益全] 執行極速貼配 -> 欄位: ${targetSelector}`)
    await this.fastType(page, targetSelector, searchTerm)
    await page.keyboard.press('Enter')
    await page.click('button.btn-primary.btn-block')

    console.log('[YC] Waiting for results...')
    try {
      // Results are in .thumbnail elements
      await page.waitForSelector('.thumbnail', { timeout: 8000 })
    } catch (e) {
      console.log('[YC] Timeout waiting for results or no matches found.')
      return []
    }

    const results: ProductResult[] = await page.evaluate((platform) => {
      const items = Array.from(document.querySelectorAll('.thumbnail'))
      if (items.length === 0) return []

      return items.map((item) => {
        const titleEl = item.querySelector('.thumbnail-title a') as HTMLAnchorElement
        if (!titleEl) return null

        const name = titleEl.innerText.trim()
        const link = titleEl.href

        const contentEl = item.querySelector('.thumbnail-content') as HTMLElement
        const contentText = contentEl?.innerText || ''

        // Parsing logic:
        // 製造商：XXX
        // 健保代碼：XXX
        // 售價：$XXX
        // 庫存：XXX
        
        const priceMatch = contentText.match(/售價：\$([\d,.]+)/)
        const price = priceMatch ? parseFloat(priceMatch[1].replace(/,/g, '')) : 0
        
        const stockMatch = contentText.match(/庫存：(\d+)/)
        const stock = stockMatch ? stockMatch[1] : '未知'

        const mfgMatch = contentText.match(/製造商：(.+)/)
        const spec = mfgMatch ? mfgMatch[1].trim() : ''

        return {
          platform,
          name: name,
          spec: spec,
          price: isNaN(price) ? 0 : price,
          unit: '袋/盒', // YC doesn't always show unit clearly in card, default to generic
          stock: stock,
          link: link,
        }
      }).filter(r => r !== null && r.name) as ProductResult[]
    }, this.platformName)

    console.log(`[YC] Scraped ${results.length} products.`)
    return results
  }
}
