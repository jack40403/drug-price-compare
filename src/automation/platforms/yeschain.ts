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
      const bodyText = await page.textContent('body')
      // 優先檢查頁面上是否有實體的登入特徵（如「登出」或「歡迎您」）
      const hasIndicators = bodyText?.includes('登出') || bodyText?.includes('歡迎您')
      
      const url = page.url()
      // 如果有登入特徵，或者網址已經進入了內部目錄，即判定為已登入
      const isLoggedIn = hasIndicators || (!url.includes('b2bStoreCart/login') && 
             (url.includes('b2bStoreCart/') || url.includes('order') || url.includes('prod') || url.includes('otcProd')))
             
      console.log(`[好鄰居] 登入狀態檢查: ${isLoggedIn}`)
      return isLoggedIn
    } catch (e) {
      return false
    }
  }

  async login(page: Page, creds: any): Promise<boolean> {
    console.log('[好鄰居] 正在導向登入頁面...')
    await page.goto(this.baseUrl, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1000)

    if (await this.isLoggedIn(page)) return true

    console.log('[好鄰居] 正在輸入帳密 (擬人化)...')
    await this.humanType(page, 'input#email', creds.username)
    await this.humanType(page, 'input#password', creds.password)
    
    // 【靜態監視模式】等到出現明確的登入後頁面特徵
    try {
      console.log('[好鄰居] 請在視窗中輸入驗證碼並登入 (監控中)...')

      await page.waitForFunction(() => {
        const text = document.body.innerText
        const url = window.location.href
        return url.includes('otcProd') ||
               url.includes('b2bStoreCart/prod') ||
               text.includes('登入成功') ||
               text.includes('歡迎您')
      }, { timeout: 300000 })

      // 等待 session cookie 穩定，後續由 search() 負責導航至正確頁面
      console.log('[好鄰居] 偵測到登入成功，等待 session 穩定...')
      await page.waitForTimeout(2000)
      console.log('[好鄰居] 登入完成，交由搜尋流程接手。')
    } catch (e) {
      console.warn('[好鄰居] 登入等待超時，交由後續流程處理:', e)
    }

    return true
  }

  async search(page: Page, searchTerm: string): Promise<ProductResult[]> {
    console.log(`[好鄰居] 正準備搜尋: "${searchTerm}"`)
    const isCode = this.isNHICode(searchTerm)
    const fieldName = isCode ? '健保碼' : '品名'
    
    // 根據判定結果選擇目標頁面與選擇器
    const targetUrl = isCode 
      ? 'https://www.yeschain.com.tw/b2bStoreCart/prod' 
      : 'https://www.yeschain.com.tw/b2bStoreCart/otcProd'
    
    const targetSelector = isCode 
      ? 'input[placeholder*="健保碼至少5個字"]' 
      : 'input[placeholder*="品名至少2個字"]'

    console.log(`[好鄰居] ===============================`)
    console.log(`[好鄰居] 判定結果: ${fieldName}`)
    console.log(`[好鄰居] 目標頁面: ${targetUrl}`)
    console.log(`[好鄰居] 動作: 填入 ${fieldName} 欄位 (${targetSelector})`)
    console.log(`[好鄰居] ===============================`)

    // 1. 永遠導航至正確的搜尋分類頁，確保頁面狀態乾淨，不依賴登入後的殘留位置
    console.log(`[好鄰居] 導航至 ${fieldName} 搜尋頁: ${targetUrl}`)
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' })

    try {
      await page.waitForSelector(targetSelector, { timeout: 20000 })
      
      // 2. 極速貼入 (fastType 會自動處理並實現瞬間值注入)
      console.log(`[好鄰居] 執行極速貼入 -> 欄位: ${targetSelector}`)
      await this.fastType(page, targetSelector, searchTerm)
      
      // 3. 安全觸發搜尋：優先使用 Enter 鍵 (最穩當，可避開點擊到導覽列登出鈕的風險)
      console.log('[好鄰居] 輸入完成，執行 Enter 鍵觸發搜尋...')
      await page.keyboard.press('Enter')
      
      // 4. 輔助點擊：如果 Enter 沒反應，再執行局部精確點擊
      await page.waitForTimeout(500)
      const queryBtn = page.locator(targetSelector).locator('xpath=following-sibling::button | following-sibling::span//button').first()
      
      if (await queryBtn.isVisible()) {
        console.log('[好鄰居] 執行局部精確點擊搜尋鈕...')
        await queryBtn.click({ delay: 100 })
      }
      
      console.log('[好鄰居] 等待搜尋結果載入...')
      await page.waitForTimeout(2000)
    } catch (e) {
      console.warn(`[好鄰居] ${fieldName} 搜尋流程發生異常:`, e)
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
