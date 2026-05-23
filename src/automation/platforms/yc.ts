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
    await this.fastType(page, userField, creds.username)
    await this.fastType(page, passField, creds.password)

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

  async search(page: Page, searchTerm: string, filters?: any): Promise<ProductResult[]> {
    console.log(`[YC] Searching for: "${searchTerm}", Filters: ${JSON.stringify(filters)}`)

    if (!page.url().includes('/product/all/index.html')) {
      await page.goto(`${this.baseUrl}/product/all/index.html`, { waitUntil: 'domcontentloaded' })
    }

    try {
      // 根據手動勾選決定欄位
      const isCode = filters?.code === true;
      const targetSelector = isCode ? 'input[name="code"]' : 'input[name="product_name"]'
      
      await page.waitForSelector(targetSelector, { timeout: 5000 })
      await this.fastType(page, targetSelector, searchTerm)
      await page.keyboard.press('Enter')
      
      const searchBtn = await page.$('button.btn-primary.btn-block, button:has-text("搜尋")')
      if (searchBtn) await searchBtn.click()

      await page.waitForTimeout(2000)
    } catch (e) {
      console.warn('[YC] Search interaction failed')
    }

    const results: ProductResult[] = await page.evaluate((platform) => {
      // 1. 偵測無結果
      const bodyText = document.body.innerText;
      if (bodyText.includes('目前顯示到第 0 筆') || bodyText.includes('共 0 筆')) {
        return [{
          platform,
          name: '⚠️ 無此藥品 (益全未收錄)',
          spec: '-',
          price: 0,
          unit: '-',
          stock: '缺貨',
          link: window.location.href,
          expiry: '-',
          nhiCode: '-',
          nhiPrice: 0
        }]
      }

      // 2. 抓取產品卡片 (使用精確的 .product_info_div)
      const cards = Array.from(document.querySelectorAll('.product_info_div'));
      if (cards.length === 0) {
        // 備案：如果結構變動，嘗試原本的 .thumbnail
        const alternates = Array.from(document.querySelectorAll('.thumbnail'));
        if (alternates.length > 0) return alternates.map(alt => ({ platform, name: '結構變動(待更新)', price: 0, unit: '', stock: '', link: '' }));
        return [];
      }

      return cards.map((card) => {
        // 品名 (第一個 A 標籤)
        const nameEl = card.querySelector('a');
        const name = nameEl ? nameEl.innerText.trim() : '未知藥品';
        const link = (nameEl as HTMLAnchorElement)?.href || window.location.href;

        // 健保碼 (在 col-6 裡面)
        const text = (card as HTMLElement).innerText;
        const nhiMatch = text.match(/健保碼[：:]\s*([A-Z0-9]+)/);
        const nhiCode = nhiMatch ? nhiMatch[1] : '';

        // 效期 (.product_valid_date)
        const expiryEl = card.querySelector('.product_valid_date');
        const expiry = expiryEl ? expiryEl.innerText.trim() : '';

        // 售價 (.product_item_price)
        const priceEl = card.querySelector('.product_item_price');
        const priceText = priceEl ? priceEl.innerText.replace(/[^0-9.]/g, '') : '0';
        const price = parseFloat(priceText) || 0;

        // 庫存 (.product_item_out_stock)
        const stockEl = card.querySelector('.product_item_out_stock');
        const stockQty = stockEl ? stockEl.innerText.trim() : '';
        const stock = stockQty ? `庫存：${stockQty}` : '有供貨';

        // 單位 (從品名或文字找)
        const unitMatch = name.match(/\/ (盒|袋|瓶|支|組|排)/) || text.match(/(?:包裝|\/)\s*\d*\s*(盒|袋|瓶|支|組|排)/);
        const unit = unitMatch ? unitMatch[1] : '單位';

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
          link,
          expiry,
          nhiCode,
          nhiPrice: 0
        };
      });
    }, this.platformName)

    return results
  }
}
