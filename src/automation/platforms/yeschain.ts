import type { Page, BrowserContext } from 'playwright'
import { Connector } from '../connector'
import type { ProductResult } from '../connector'

export class YesChainConnector extends Connector {
  platformId = 'yeschain'
  platformName = '好鄰居 (躍獅)'
  baseUrl = 'https://www.yeschain.com.tw/b2bStoreCart/home'

  protected context: BrowserContext
  constructor(context: BrowserContext, captchaHandler?: (platformId: string, platformName: string, image: string) => Promise<string>) {
    super(context, captchaHandler)
    this.context = context
  }

  async isLoggedIn(page: Page): Promise<boolean> {
    try {
      // 1. 底層檢查：LocalStorage 裡的 Token
      const storageToken = await page.evaluate(() => localStorage.getItem('token') || '')
      
      // 2. 視覺檢查：看畫面上是否有「登出」文字或「藥局」文字 (這是最穩定的指標)
      // 使用 page.textContent 抓取 body 的純文字內容來比對
      const bodyText = await page.innerText('body')
      const hasLogoutText = bodyText.includes('登出')
      const hasPharmacyGreeting = bodyText.includes('藥局') && bodyText.includes('您好')

      return storageToken.length > 50 || hasLogoutText || hasPharmacyGreeting
    } catch (e) {
      return false
    }
  }

  async login(page: Page, creds: any): Promise<boolean> {
    await page.goto(this.baseUrl, { waitUntil: 'networkidle' })
    if (await this.isLoggedIn(page)) return true

    try {
      // 核心修正 1：如果畫面上看得到「登入」按鈕但沒看到輸入框，先點按鈕觸發
      const loginTrigger = page.locator('button:has-text("登入"), a:has-text("登入")').filter({ visible: true }).first()
      const emailInput = page.locator('input#email').filter({ visible: true }).first()
      
      if (await loginTrigger.isVisible() && !(await emailInput.isVisible())) {
        console.log('[好鄰居] 點擊登入入口按鈕...')
        await loginTrigger.click()
        await page.waitForTimeout(1000)
      }

      // 核心修正 2：使用 visible 過濾器避開分身
      console.log('[好鄰居] 正在填入帳號密碼 (精確定位可見欄位)...')
      await emailInput.waitFor({ state: 'visible', timeout: 8000 })
      await this.fastType(page, 'input#email >> visible=true', creds.username)
      await this.fastType(page, 'input#password >> visible=true', creds.password)
      
      // 偵測是否有驗證碼
      const rcode = page.locator('input#rcode').filter({ visible: true }).first()
      if (await rcode.isVisible()) {
        console.log('[好鄰居] 偵測到驗證碼，正在截圖並請求遠端輸入...')
        
        if (this.captchaHandler) {
          try {
            // [終極優化] 抓取包含 getRandom 關鍵字的所有圖片
            let captchaImg = page.locator("img[src*='getRandom'], img[src*='Code'], img[src*='rcode']").first()
            
            if (!(await captchaImg.isVisible())) {
              captchaImg = page.locator('input#rcode + div img, input#rcode ~ img, .formBox img').first()
            }

            console.log('[好鄰居] 正在等待驗證碼圖片載入...')
            await captchaImg.waitFor({ state: 'visible', timeout: 10000 })
            
            await page.waitForTimeout(500)
            const screenshot = await captchaImg.screenshot({ type: 'png' })
            const base64Image = `data:image/png;base64,${screenshot.toString('base64')}`
            
            const code = await this.captchaHandler(this.platformId, this.platformName, base64Image)
            console.log(`[好鄰居] 收到驗證碼: ${code}，正在自動填入...`)
            
            await page.fill('input#rcode', code)
            await this.humanType(page, 'input#rcode >> visible=true', code)
            await page.waitForTimeout(500) // 等待穩定
            
            const submitBtn = page.locator('button[type="submit"]:has-text("登入"), button:has-text("登入")').filter({ visible: true }).first()
            await submitBtn.click()
            await page.waitForTimeout(2000)
          } catch (e) {
            console.log('[好鄰居] 遠端驗證碼流程失敗，切換回手動監控模式...')
          }
        }

        // 核心修正 3：輪詢感應 Token (300秒)
        for (let i = 0; i < 300; i++) {
          if (await this.isLoggedIn(page)) {
            console.log('[好鄰居] 成功感應到登入憑證！')
            return true
          }
          await page.waitForTimeout(1000)
        }
      } else {
        const submitBtn = page.locator('button:has-text("登入")').filter({ visible: true }).first()
        await submitBtn.click()
        await page.waitForTimeout(2000)
      }
    } catch (e) {
      console.log('[好鄰居] 登入過程發生錯誤:', e)
    }

    return await this.isLoggedIn(page)
  }

  async search(page: Page, searchTerm: string, filters?: any): Promise<ProductResult[]> {
    try {
      console.log('[好鄰居] 正在強制跳轉至產品搜尋頁面...')
      // 導向正確的搜尋頁面路徑
      await page.goto('https://www.yeschain.com.tw/b2bStoreCart/prod', { waitUntil: 'networkidle' })
      
      // 根據 filters 選擇對應搜尋框
      let searchInput = 'input[placeholder*="品名"]'
      if (filters?.code === true) {
        searchInput = 'input[placeholder*="健保碼"]'
      } else if (filters?.component === true) {
        searchInput = 'input[placeholder*="成分"]'
      }
      await page.waitForSelector(searchInput, { state: 'visible', timeout: 10000 })

      console.log(`[好鄰居] 執行搜尋: "${searchTerm}" → ${searchInput}`)
      await this.fastType(page, searchInput, searchTerm)
      
      // 點擊查詢按鈕 (更強悍的點擊策略：滾動到視線內 + 強制點擊最後一個「查詢」按鈕)
      const submitBtn = page.locator('button').filter({ hasText: /^\s*查詢\s*$/ }).last()
      
      console.log('[好鄰居] 正在定位並點擊查詢按鈕...')
      await submitBtn.scrollIntoViewIfNeeded()
      await page.waitForTimeout(500)
      await submitBtn.click({ force: true })
      
      // 等待結果載入 (好鄰居是用 AJAX 載入，給予充足時間)
      await page.waitForTimeout(3500)
    } catch (e) {
      console.log('[好鄰居] 搜尋動作失敗:', e)
      return []
    }

    const allResults: ProductResult[] = []
    let pageCount = 1
    const MAX_PAGES = 50

    while (pageCount <= MAX_PAGES) {
      try {
        await page.waitForSelector('tr', { timeout: 8000 })
        await page.waitForTimeout(500)
      } catch (e) {
        console.log(`[好鄰居] 第 ${pageCount} 頁無資料或載入超時`)
        break
      }

      const pageResults: ProductResult[] = await page.evaluate((platform) => {
        try {
          const rows = Array.from(document.querySelectorAll('tr')).filter(tr => {
            return tr.innerText.includes('NT$') || /[A-Z0-9]{10}/.test(tr.innerText);
          });

          return rows.map((row) => {
            const pTags = Array.from(row.querySelectorAll('p'));
            const pTexts = pTags.map(p => p.innerText.trim());

            const nhiCode = pTexts.find(t => /^[A-Z0-9]{10}$/.test(t)) || '';

            const nhiPriceText = pTexts.find(t => t.includes('NT$') && t.length < 15) || '';
            const nhiPrice = parseFloat(nhiPriceText.replace(/[^0-9.]/g, '')) || 0;

            const nameParts = pTexts.filter(t =>
              t.length > 5 &&
              !/^[A-Z0-9]{10}$/.test(t) &&
              !t.includes('NT$') &&
              !t.includes('粒/盒')
            );
            const name = nameParts.join(' ') || '未知藥品';

            const optionEl = row.querySelector('option');
            const priceText = optionEl ? optionEl.innerText.trim() : (pTexts.find(t => t.includes('NT$') && t.length > 15) || '');
            const price = parseFloat(priceText.match(/NT\$\s*([\d,.]+)/)?.[1]?.replace(/,/g, '') || '0');
            const unit = priceText.split('/').pop()?.trim() || '單位';

            const stockEl = row.querySelector('span.font-bold');
            const stock = stockEl ? stockEl.innerText.trim() : '有貨';

            const expiryMatch = row.innerText.match(/(\d{4}[-/]\d{2}[-/]\d{2})/);
            const expiry = expiryMatch ? expiryMatch[1] : '';

            let unitPrice: number | undefined = undefined;
            const sizeMatch = row.innerText.match(/(\d+)(?:PTP|錠|粒|顆|支|瓶|入|T)/i);
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
      console.log(`[好鄰居] 第 ${pageCount} 頁抓取完成，目前共 ${allResults.length} 筆`)

      const pageBeforeNext = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('tr')).filter(tr => tr.innerText.includes('NT$'))
        const paginationContainers = Array.from(document.querySelectorAll('div.justify-end, nav, [class*="pagination"], [class*="Pagination"]')) as HTMLElement[]
        const pageNumbers = paginationContainers
          .flatMap(container => Array.from(container.querySelectorAll('button, li, span, a')))
          .map(el => Number((el as HTMLElement).innerText?.trim()))
          .filter(n => Number.isInteger(n) && n > 0)
        const activePage = paginationContainers
          .flatMap(container => Array.from(container.querySelectorAll('[aria-current="page"], .active, .is-active, [class*="active"]')))
          .map(el => Number((el as HTMLElement).innerText?.trim()))
          .find(n => Number.isInteger(n) && n > 0)

        return {
          firstRowText: rows[0]?.innerText || '',
          rowCount: rows.length,
          currentPage: activePage || (pageNumbers.length ? Math.min(...pageNumbers) : 1),
        }
      })

      const nextPageReady = await page.evaluate(() => {
        const isVisible = (el: HTMLElement) => {
          const style = window.getComputedStyle(el)
          const rect = el.getBoundingClientRect()
          return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0
        }
        const isDisabled = (el: HTMLElement) => {
          const disabledOwner = el.closest('button, a, li, span') as HTMLElement | null
          const target = disabledOwner || el
          const className = target.className?.toString() || ''
          return (
            target.hasAttribute('disabled') ||
            target.getAttribute('aria-disabled') === 'true' ||
            /disabled|disable|is-disabled|cursor-not-allowed|opacity-50/.test(className)
          )
        }

        const rows = Array.from(document.querySelectorAll('tr')).filter(tr => tr.innerText.includes('NT$'))
        const table = rows[0]?.closest('table')
        const resultArea = table?.parentElement?.parentElement || table?.parentElement || document.body
        const containers = Array.from(resultArea.querySelectorAll('div.justify-end, nav, [class*="pagination"], [class*="Pagination"]')) as HTMLElement[]

        for (const container of containers) {
          if (!isVisible(container)) continue

          const numericPages = Array.from(container.querySelectorAll('button, li, span, a'))
            .map(el => Number((el as HTMLElement).innerText?.trim()))
            .filter(n => Number.isInteger(n) && n > 0)
          const activePage = Array.from(container.querySelectorAll('[aria-current="page"], .active, .is-active, [class*="active"]'))
            .map(el => Number((el as HTMLElement).innerText?.trim()))
            .find(n => Number.isInteger(n) && n > 0)
          const currentPage = activePage || (numericPages.length ? Math.min(...numericPages) : 1)
          const hasRealNextPage = numericPages.some(n => n > currentPage)
          if (!hasRealNextPage) continue

          const nextBtn = Array.from(container.querySelectorAll('button, a, span[role="button"], li, span')).find(el => {
            const element = el as HTMLElement
            const text = element.innerText?.trim() || ''
            const aria = element.getAttribute('aria-label') || element.getAttribute('title') || ''
            return (
              (text === '下一頁' || aria.includes('下一頁') || aria.toLowerCase().includes('next')) &&
              isVisible(element) &&
              !isDisabled(element)
            )
          }) as HTMLElement | undefined

          if (nextBtn) {
            nextBtn.click()
            return { clicked: true, nextPage: currentPage + 1 }
          }
        }

        return { clicked: false, nextPage: null }
      })

      if (!nextPageReady.clicked) {
        console.log('[好鄰居] 下一頁按鈕不存在或已停用，停止翻頁')
        break
      }

      try {
        await page.waitForFunction((oldState) => {
          const rows = Array.from(document.querySelectorAll('tr')).filter((tr: any) => tr.innerText.includes('NT$'))
          const paginationContainers = Array.from(document.querySelectorAll('div.justify-end, nav, [class*="pagination"], [class*="Pagination"]')) as HTMLElement[]
          const activePage = paginationContainers
            .flatMap(container => Array.from(container.querySelectorAll('[aria-current="page"], .active, .is-active, [class*="active"]')))
            .map(el => Number((el as HTMLElement).innerText?.trim()))
            .find(n => Number.isInteger(n) && n > 0)

          return (
            rows.length > 0 &&
            (rows[0].innerText !== oldState.firstRowText ||
              rows.length !== oldState.rowCount ||
              (activePage && activePage !== oldState.currentPage))
          )
        }, pageBeforeNext, { timeout: 8000 })
        console.log(`[好鄰居] 下一頁載入成功，目前第 ${nextPageReady.nextPage || pageCount + 1} 頁`)
      } catch (e) {
        console.log('[好鄰居] 翻頁後頁面未變化，停止')
        break
      }

      pageCount++
    }

    console.log(`[好鄰居] 全部抓取完成，共 ${allResults.length} 筆`)
    return allResults
  }
}
