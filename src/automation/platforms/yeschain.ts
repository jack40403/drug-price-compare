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
      await this.humanType(page, 'input#email >> visible=true', creds.username)
      await this.humanType(page, 'input#password >> visible=true', creds.password)
      
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
      
      // 等待搜尋框出現 (使用診斷後的精確 placeholder)
      const searchInput = 'input[placeholder*="品名"]'
      await page.waitForSelector(searchInput, { state: 'visible', timeout: 10000 })
      
      console.log(`[好鄰居] 執行搜尋: "${searchTerm}"`)
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

    const results: ProductResult[] = await page.evaluate((platform) => {
      try {
        // 抓取所有資料列 (跳過標題列)
        const rows = Array.from(document.querySelectorAll('tr')).filter(tr => {
          return tr.innerText.includes('NT$') || /[A-Z0-9]{10}/.test(tr.innerText);
        });

        return rows.map((row) => {
          const pTags = Array.from(row.querySelectorAll('p'));
          const pTexts = pTags.map(p => p.innerText.trim());

          // 1. 健保碼 (尋找符合 10 位英數的 P)
          const nhiCode = pTexts.find(t => /^[A-Z0-9]{10}$/.test(t)) || '';

          // 2. 健保價 (尋找包含 NT$ 的 P)
          const nhiPriceText = pTexts.find(t => t.includes('NT$') && t.length < 15) || '';
          const nhiPrice = parseFloat(nhiPriceText.replace(/[^0-9.]/g, '')) || 0;

          // 3. 品名 (組合所有藥名相關的 P，排除健保碼和售價)
          // 通常是中文名 + 英文名
          const nameParts = pTexts.filter(t => 
            t.length > 5 && 
            !/^[A-Z0-9]{10}$/.test(t) && 
            !t.includes('NT$') &&
            !t.includes('粒/盒')
          );
          const name = nameParts.join(' ') || '未知藥品';

          // 4. 售價與單位 (關鍵：從 OPTION 裡抓)
          const optionEl = row.querySelector('option');
          const priceText = optionEl ? optionEl.innerText.trim() : (pTexts.find(t => t.includes('NT$') && t.length > 15) || '');
          const price = parseFloat(priceText.match(/NT\$\s*([\d,.]+)/)?.[1]?.replace(/,/g, '') || '0');
          const unit = priceText.split('/').pop()?.trim() || '單位';

          // 5. 庫存
          const stockEl = row.querySelector('span.font-bold');
          const stock = stockEl ? stockEl.innerText.trim() : '有貨';

          // 6. 有效期限 (通常在 P 裡面或是組合在藥名裡)
          const expiryMatch = row.innerText.match(/(\d{4}[-/]\d{2}[-/]\d{2})/);
          const expiry = expiryMatch ? expiryMatch[1] : '';

          // 單價換算
          let unitPrice: number | undefined = undefined;
          const sizeMatch = row.innerText.match(/(\d+)(?:PTP|錠|粒|顆|支|瓶|入|T)/i);
          if (sizeMatch && price > 0) {
            const size = parseInt(sizeMatch[1]);
            if (size > 0) unitPrice = Math.round((price / size) * 100) / 100;
          }

          return {
            platform,
            name,
            spec: '',
            price,
            unit,
            unitPrice,
            stock,
            link: window.location.href,
            expiry,
            nhiCode,
            nhiPrice
          };
        });
      } catch (e) {
        return [];
      }
    }, this.platformName)

    return results
  }
}
