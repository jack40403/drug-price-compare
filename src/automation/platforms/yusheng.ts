import type { Page, BrowserContext } from 'playwright'
import { Connector } from '../connector'
import type { ProductResult } from '../connector'

export class YuShengConnector extends Connector {
  platformId = 'yusheng'
  platformName = '宇盛'
  baseUrl = 'https://www.yusheng0307.com/'

  protected context: BrowserContext
  constructor(context: BrowserContext) {
    super(context)
    this.context = context
  }

  async isLoggedIn(page: Page): Promise<boolean> {
    try {
      // 關鍵修正：不能檢查「會員中心」，因為它在頁尾始終存在 (False Positive)
      // 必須精確偵測「會員登出」字樣
      const bodyText = await page.textContent('body')
      const isLoggedIn = bodyText?.includes('會員登出') || false
      console.log(`[宇盛] 登入狀態檢查: ${isLoggedIn}`)
      return isLoggedIn
    } catch (e) {
      return false
    }
  }

  async login(page: Page, creds: any): Promise<boolean> {
    console.log('[宇盛] 偵測目前連線狀態...')
    await page.goto(this.baseUrl, { waitUntil: 'networkidle' })
    
    if (await this.isLoggedIn(page)) return true

    console.log('[宇盛] 正在觸發會員登入彈窗...')
    try {
      // 1. 偵測並點選「漢堡選單」 (手機版寬度)
      const menuToggler = page.locator('button.navbar-toggler, i.fa-bars, .navbar-toggle').first()
      if (await menuToggler.isVisible()) {
        console.log('[宇盛] 偵測到手機版選單，正在開啟...')
        await menuToggler.click({ force: true })
        await page.waitForTimeout(800) // 等待選單展開動畫
      }

      // 2. 點選「會員登入」按鈕
      const loginTrigger = page.locator('a:has-text("會員登入"), button:has-text("會員登入"), span:has-text("會員登入")').first()
      await loginTrigger.waitFor({ state: 'visible', timeout: 5000 })
      await loginTrigger.click({ force: true })
      
      // 3. 關鍵：等待登入彈窗動畫跑完
      console.log('[宇盛] 等待登入彈窗動畫...')
      await page.waitForTimeout(1200) 
      
      // 4. 定位於帳號輸入框 (改用更廣泛的選取器以應對 Modal)
      const accountInput = page.locator('input[name="account"], input[placeholder*="帳號"]').first()
      await accountInput.waitFor({ state: 'visible', timeout: 5000 })
      
      console.log('[宇盛] 正在擬人化輸入帳密...')
      await this.humanType(page, 'input[name="account"]', creds.username)
      await this.humanType(page, 'input[name="pwd"]', creds.password)
      
      // 5. 點擊登入提交
      await page.click('#ulogin_submit2', { force: true })
      
      // 等待 Session 建立
      await page.waitForTimeout(2000)
    } catch (e) {
      console.error('[宇盛] 觸發登入流程失敗:', e)
    }
    
    return await this.isLoggedIn(page)
  }

  async search(page: Page, searchTerm: string): Promise<ProductResult[]> {
    console.log(`[宇盛] 正準備發動搜尋: "${searchTerm}"`)
    
    try {
      await page.goto('https://www.yusheng0307.com/product.html', { waitUntil: 'networkidle' })
      console.log('[宇盛] 執行極速貼入搜尋...')
      await this.fastType(page, 'input[name="keyword"]', searchTerm)
      await page.keyboard.press('Enter')
      
      await page.waitForSelector('a.text-info, .text-outofstock', { timeout: 8000 })
      await page.waitForTimeout(1500)
    } catch (e) {
      console.log('[宇盛] 搜尋逾時或無結果')
      return []
    }

    const results: ProductResult[] = await page.evaluate((platform) => {
      try {
        // 1. 鎖定真正的產品大行 (d-lg-block 且包含健保碼)
        const rows = Array.from(document.querySelectorAll('li.d-lg-block')).filter(row => {
          return row.querySelector('a.text-info') !== null && !row.innerText.includes('產品圖');
        });

        if (rows.length === 0) return [];

        return rows.map((row) => {
          const rowText = (row as HTMLElement).innerText;

          // 品名 (.fw-bolder)
          const nameEl = row.querySelector('.fw-bolder');
          const name = nameEl ? nameEl.innerText.trim() : '未知藥品';

          // 健保碼 (a.text-info)
          const nhiEl = row.querySelector('a.text-info');
          const nhiCode = nhiEl ? nhiEl.innerText.trim() : '';

          // 健保價 (改用正則尋找文字 "健保價： 14.80")
          const nhiPriceMatch = rowText.match(/健保價\s*[:：]\s*([\d,.]+)/);
          const nhiPrice = nhiPriceMatch ? parseFloat(nhiPriceMatch[1].replace(/,/g, '')) : 0;

          // 售價 (span.fs-5)
          const priceEl = row.querySelector('span.fs-5');
          const price = priceEl ? parseFloat(priceEl.innerText.replace(/[^0-9.]/g, '')) : 0;

          // 單位
          const priceAreaText = priceEl?.parentElement?.innerText || '';
          const unitMatch = priceAreaText.match(/\/\s*([^\n\s：:]+)/);
          const unit = unitMatch ? unitMatch[1].trim() : '單位';

          // 庫存
          const isOutOfStock = row.querySelector('.text-outofstock') !== null;
          const stock = isOutOfStock ? '缺貨中' : '有供貨';

          // 有效期限
          const expiryMatch = rowText.match(/(\d{4}[-/]\d{2}[-/]\d{2})/);
          const expiry = expiryMatch ? expiryMatch[1] : '';

          // 單價換算
          let unitPrice: number | undefined = undefined;
          const sizeMatch = name.match(/(\d+)(?:PTP|錠|粒|顆|支|瓶|入|T)/i);
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
