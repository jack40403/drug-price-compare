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

    console.log('[好鄰居] 正在輸入帳密 (擬人化)...')
    await this.humanType(page, 'input#email', creds.username)
    await this.humanType(page, 'input#password', creds.password)

    try {
      console.log('[好鄰居] 請在視窗中輸入驗證碼並登入 (監控中)...')

      // 等待「離開登入頁」作為成功訊號，不依賴目標頁面的文字或 URL
      await page.waitForFunction(() => {
        return !window.location.href.includes('b2bStoreCart/login')
      }, { timeout: 300000 })

      // 等待 redirect chain 完全結束
      console.log('[好鄰居] 偵測到離開登入頁，等待 redirect 完成...')
      await page.waitForTimeout(2000)

      // 明確跳轉到搜尋頁，與 MDT 相同做法
      console.log('[好鄰居] 跳轉至 otcProd 搜尋頁...')
      await page.goto('https://www.yeschain.com.tw/b2bStoreCart/prod', { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(1000)
      console.log('[好鄰居] 登入完成。')
    } catch (e) {
      console.warn('[好鄰居] 登入等待超時或跳轉失敗:', e)
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
    
    // 多候選選擇器：實際 placeholder 可能與「健保碼至少5個字」有差異
    const candidateSelectors = isCode
      ? [
          'input[placeholder*="健保碼至少5個字"]',
          'input[placeholder*="健保碼"]',
          'input[placeholder*="健保"]',
          'input[name*="hid"]',
          'input[name*="code"]',
        ]
      : [
          'input[placeholder*="品名至少2個字"]',
          'input[placeholder*="品名"]',
          'input[placeholder*="名稱"]',
          'input[name*="drug"]',
          'input[name*="name"]',
        ]

    console.log(`[好鄰居] ===============================`)
    console.log(`[好鄰居] 判定結果: ${fieldName}`)
    console.log(`[好鄰居] 目標頁面: ${targetUrl}`)
    console.log(`[好鄰居] ===============================`)

    // 1. 若不在正確頁面才導航
    if (!page.url().includes(isCode ? 'b2bStoreCart/prod' : 'b2bStoreCart/otcProd')) {
      console.log(`[好鄰居] 導航至 ${fieldName} 搜尋頁: ${targetUrl}`)
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(800)
    } else {
      // 已在正確頁面，等待 SPA 完全渲染
      await page.waitForTimeout(800)
    }

    // 2. 依序嘗試候選選擇器（第一個給較長 timeout 等 SPA 渲染）
    let foundSelector: string | null = null
    for (let i = 0; i < candidateSelectors.length; i++) {
      const sel = candidateSelectors[i]
      const timeout = i === 0 ? 15000 : 3000
      try {
        await page.waitForSelector(sel, { state: 'visible', timeout })
        foundSelector = sel
        console.log(`[好鄰居] 命中搜尋框選擇器: ${sel}`)
        break
      } catch {
        console.log(`[好鄰居] 選擇器無效，嘗試下一個: ${sel}`)
      }
    }

    // 兜底：找頁面上第一個可見的非密碼 input
    if (!foundSelector) {
      try {
        const candidate = page.locator('input').filter({ hasNot: page.locator('[type="hidden"], [type="password"]') }).first()
        if (await candidate.isVisible({ timeout: 3000 })) {
          foundSelector = 'input:not([type="hidden"]):not([type="password"])'
          console.log(`[好鄰居] 使用兜底選擇器: 第一個可見 input`)
        }
      } catch {}
    }

    if (!foundSelector) {
      console.warn(`[好鄰居] 找不到任何可用的 ${fieldName} 搜尋框，當前 URL: ${page.url()}`)
      return []
    }

    try {
      console.log(`[好鄰居] 執行極速貼入 -> ${foundSelector}`)
      await this.fastType(page, foundSelector, searchTerm)

      console.log('[好鄰居] 輸入完成，執行 Enter 觸發搜尋...')
      await page.keyboard.press('Enter')

      await page.waitForTimeout(500)
      const queryBtn = page.locator(foundSelector).locator('xpath=following-sibling::button | following-sibling::span//button').first()
      if (await queryBtn.isVisible().catch(() => false)) {
        console.log('[好鄰居] 執行精確點擊搜尋鈕...')
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
