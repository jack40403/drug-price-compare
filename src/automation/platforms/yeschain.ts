import type { Page, BrowserContext } from 'playwright'
import { Connector } from '../connector'
import type { ProductResult } from '../connector'

export class YesChainConnector extends Connector {
  platformId = 'yeschain'
  platformName = '好鄰居 (躍獅)'
  baseUrl = 'https://www.yeschain.com.tw/b2bStoreCart/home'

  protected context: BrowserContext
  constructor(context: BrowserContext) {
    super(context)
    this.context = context
  }

  async isLoggedIn(page: Page): Promise<boolean> {
    try {
      // 1. 底層檢查：是否有連線 Session Cookie
      const cookies = await this.context.cookies()
      const hasSession = cookies.some(c => c.name.toLowerCase().includes('session') || c.name.includes('token'))
      
      // 2. 功能檢查：嘗試看目前的 URL，如果是在登入頁面就不算登入
      const url = page.url()
      if (url.includes('/login') || url.endsWith('/home')) {
        // 如果還在首頁或登入頁，且畫面上還有帳號輸入框，代表沒進去
        const hasEmailInput = await page.$('#email')
        if (hasEmailInput) return false
      }

      return hasSession || false
    } catch (e) {
      return false
    }
  }

  async login(page: Page, creds: any): Promise<boolean> {
    await page.goto(this.baseUrl, { waitUntil: 'networkidle' })
    if (await this.isLoggedIn(page)) return true

    try {
      console.log('[好鄰居] 正在填入帳號密碼...')
      // 根據診斷結果修正 ID
      await page.waitForSelector('#email', { timeout: 5000 })
      await this.humanType(page, '#email', creds.username)
      await this.humanType(page, '#password', creds.password)
      
      // 偵測是否有驗證碼
      const hasCaptcha = await page.$('#rcode')
      if (hasCaptcha) {
        console.log('[好鄰居] 偵測到驗證碼，請手動輸入並點擊登入...')
        // 核心修正：改用輪詢主動感應登入狀態 (因為網址不會變)
        for (let i = 0; i < 300; i++) {
          if (await this.isLoggedIn(page)) {
            console.log('[好鄰居] 成功感應到登入憑證！')
            return true
          }
          await page.waitForTimeout(1000) // 每秒感應一次
        }
      } else {
        await page.click('button:has-text("登入")')
        await page.waitForTimeout(2000)
      }
    } catch (e) {
      console.log('[好鄰居] 登入過程發生錯誤:', e)
    }

    return await this.isLoggedIn(page)
  }

  async search(page: Page, searchTerm: string): Promise<ProductResult[]> {
    try {
      console.log('[好鄰居] 正在強制跳轉至產品搜尋頁面...')
      // 導向正確的搜尋頁面路徑
      await page.goto('https://www.yeschain.com.tw/b2bStoreCart/prod', { waitUntil: 'networkidle' })
      
      // 等待搜尋框出現
      const searchInput = 'input[placeholder*="商品"]'
      await page.waitForSelector(searchInput, { timeout: 10000 })
      
      console.log(`[好鄰居] 執行搜尋: "${searchTerm}"`)
      await this.fastType(page, searchInput, searchTerm)
      
      // 點擊查詢按鈕
      await page.click('button:has-text("查詢")')
      
      // 等待結果載入
      await page.waitForTimeout(2500)
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
