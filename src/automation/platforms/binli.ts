import type { Page } from 'playwright'
import { Connector } from '../connector'
import type { ProductResult } from '../connector'

export class BinLiConnector extends Connector {
  platformId = 'binli'
  platformName = '彬利'
  baseUrl = 'https://www.twbingli.com/index.php'

  async isLoggedIn(page: Page): Promise<boolean> {
    const loginBtn = await page.$('a.sign-first[title="會員登入"]')
    const isLoggedIn = loginBtn === null
    console.log(`[BinLi] Logged in status: ${isLoggedIn}`)
    return isLoggedIn
  }

  async login(page: Page, creds: any): Promise<boolean> {
    console.log('[BinLi] Navigating to login page...')
    await page.goto(this.baseUrl)
    
    console.log('[彬利] 正在輸入帳密 (擬人化)...')
    await this.humanType(page, 'input[placeholder="請輸入帳號"]', creds.username)
    await this.humanType(page, 'input[placeholder="請輸入密碼"]', creds.password)
    
    console.log('[BinLi] Clicking login button...')
    await page.click('button.ulogin.yellow')
    
    await page.waitForTimeout(4000)
    
    const success = await this.isLoggedIn(page)
    if (!success) {
      console.warn('[BinLi] Login attempt failed. You may need to solve a captcha or close a modal manually.')
    }
    return success
  }

  async search(page: Page, searchTerm: string): Promise<ProductResult[]> {
    console.log(`[BinLi] Searching for: "${searchTerm}"`)

    // [保留彈窗] 監聽對話框但不執行 dismiss()，讓視窗留給使用者看
    page.on('dialog', async dialog => {
      console.log(`[BinLi] 偵測到網頁提示: ${dialog.message()}`)
      // 故意不呼叫 dialog.dismiss() 或 dialog.accept()
      // 這樣視窗就會留在畫面上給使用者確認
    })

    await page.goto('https://www.twbingli.com/order.php')
    
    // Check for login redirect
    if (page.url().includes('login') || !await this.isLoggedIn(page)) {
      console.log('[BinLi] Not logged in or session expired, skipping search.')
      return []
    }

    const isCode = this.isNHICode(searchTerm)
    const targetSelector = isCode ? 'input[name="hid"]' : 'input[name="drug"]'
    const fieldName = isCode ? '健保碼' : '品名'

    console.log(`[彬利] ===============================`)
    console.log(`[彬利] 關鍵字: "${searchTerm}"`)
    console.log(`[彬利] 判定為健保碼: ${isCode}`)
    console.log(`[彬利] 最終判定結果 - 欄位: ${fieldName}, 內容: ${searchTerm}`)
    console.log(`[彬利] 動作: 填入 ${fieldName} 欄位 (${targetSelector})`)
    console.log(`[彬利] ===============================`)

    await this.fastType(page, targetSelector, searchTerm)
    await page.click('button.or_query, button:has-text("查詢")')
    
    console.log('[BinLi] Waiting for results table...')
    try {
      await page.waitForSelector('table.ordertable', { timeout: 10000 })
    } catch (e) {
      console.log('[BinLi] Timeout waiting for results. Maybe no matches found.')
      return []
    }

    const results: ProductResult[] = await page.evaluate((platform) => {
      const rows = Array.from(document.querySelectorAll('table.ordertable tr')).slice(1) // 跳過標題列
      if (rows.length === 0) return []

      return rows.map((row) => {
        const cols = row.querySelectorAll('td')
        if (cols.length < 5) return null
        
        // 取得品名與成分 (第 3 欄, index 2)
        const nameAndIngredient = cols[2]?.innerText.trim() || ''
        const name = nameAndIngredient.split('\n')[0] // 第一行是品名
        const spec = nameAndIngredient.split('\n')[1] || '' // 第二行通常是成分或規格

        // 解析供貨狀況與價格 (第 4 欄, index 3)
        // 格式範例: "供貨中/293\n250 / 盒"
        const statusText = cols[3]?.innerText.trim() || ''
        
        // 提取價格: 找包含 / 的那一列，通常是 "250 / 盒"
        const priceMatch = statusText.match(/([\d,.]+)\s*\/\s*(.+)/)
        const price = priceMatch ? parseFloat(priceMatch[1].replace(/,/g, '')) : 0
        const unit = priceMatch ? priceMatch[2].trim() : ''

        // 提取庫存: 通常在第一行或第二行
        const stockMatch = statusText.match(/(\d+)/)
        const stock = stockMatch ? stockMatch[1] : '未知'

        return {
          platform,
          name: name,
          spec: spec,
          price: isNaN(price) ? 0 : price,
          unit: unit,
          stock: stock,
          link: window.location.href,
        }
      }).filter(r => r !== null && r.name) as ProductResult[]
    }, this.platformName)

    console.log(`[BinLi] Scraped ${results.length} products.`)
    return results
  }
}
