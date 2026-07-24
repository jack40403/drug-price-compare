import type { Page, BrowserContext } from 'playwright'
import { Connector } from '../connector'
import type { ProductResult } from '../connector'

export class ChahwaConnector extends Connector {
  platformId = 'chahwa'
  platformName = '嘉鏵'
  baseUrl = 'https://www.chahwa.com.tw/user.php'
  protected context: BrowserContext
  private savedCreds: any = null

  constructor(context: BrowserContext) {
    super(context)
    this.context = context
  }

  /**
   * Override to capture credentials for potential auto-relogin mid-search
   */
  override async ensureLoggedIn(page: Page, creds: any): Promise<boolean> {
    this.savedCreds = creds
    return super.ensureLoggedIn(page, creds)
  }

  async isLoggedIn(page: Page): Promise<boolean> {
    // Look for logout button or welcome message
    const logoutBtn = await page.$('a:has-text("登出")')
    const welcomeMsg = await page.$('font:has-text("歡迎您回到")')
    const isLoggedIn = logoutBtn !== null || welcomeMsg !== null
    console.log(`[Chahwa] Logged in status: ${isLoggedIn}`)
    return isLoggedIn
  }

  async login(page: Page, creds: any): Promise<boolean> {
    console.log('[Chahwa] Performing fresh login (like new window)...')
    // Reset to about:blank to ensure clean state as requested
    await page.goto('about:blank')
    await page.goto(this.baseUrl, { waitUntil: 'networkidle' })
    
    if (await this.isLoggedIn(page)) return true

    console.log('[Chahwa] Opening login modal...')
    const loginTrigger = await page.$('a.gee[href="#login"]')
    if (loginTrigger) {
      await loginTrigger.click()
      await page.waitForTimeout(1000) // Wait for modal animation
    } else {
      console.warn('[Chahwa] Login trigger not found, maybe already visible?')
    }
    
    console.log('[嘉鏵] 正在輸入帳密 (擬人化)...')
    await this.fastType(page, 'input[name="username"]', creds.username)
    await this.fastType(page, 'input[name="password"]', creds.password)
    
    console.log('[Chahwa] Clicking login button...')
    await page.click('a#urlogin_a')
    
    await page.waitForTimeout(4000)
    return await this.isLoggedIn(page)
  }

  async search(page: Page, searchTerm: string, filters?: any): Promise<ProductResult[]> {
    console.log(`[嘉鏵] 正準備發動快速搜尋: "${searchTerm}", Filters: ${JSON.stringify(filters)}`)
    
    const performSearchStep = async () => {
      await page.goto('https://www.chahwa.com.tw/order.php', { waitUntil: 'networkidle' })
      
      const closeBtn = await page.$('a.bl.cancel')
      if (closeBtn) {
        console.log('[嘉鏵] 偵測到廣告，自動清除中...')
        await closeBtn.click()
      }

      // 根據手動勾選決定欄位
      const isCode = filters?.code === true;
      const isComponent = filters?.component === true;
      let targetSelector = 'input[name="drug"]'
      
      if (isCode) {
        targetSelector = 'input[name="hid"]'
      } else if (isComponent) {
        targetSelector = 'input[name="emt_drug"]'
      }
      
      console.log(`[嘉鏵] 執行極速貼上 -> 欄位: ${targetSelector}`)
      await this.fastType(page, targetSelector, searchTerm)
      await page.keyboard.press('Enter')
      
      // 關鍵修正：不再等待表格，改為等待區塊元件 .item
      await page.waitForSelector('.item', { timeout: 10000 })
      await page.waitForTimeout(2000)
    }

    try {
      await performSearchStep()
    } catch (e) {
      console.log('[嘉鏵] 搜尋超時或未見結果，檢查是否 Session 失效...')
      if (!await this.isLoggedIn(page)) {
        if (this.savedCreds) {
          const loginSuccess = await this.login(page, this.savedCreds)
          if (loginSuccess) {
            await performSearchStep()
          }
        }
      } else {
        return []
      }
    }

    const allResults: ProductResult[] = []
    let pageCount = 1
    const MAX_PAGES = 50 // 安全限制

    try {
      while (pageCount <= MAX_PAGES) {
        console.log(`[嘉鏵] 正在抓取第 ${pageCount} 頁...`)
        
        // 撈取當前頁面資料
        const pageResults: ProductResult[] = await page.evaluate((platform) => {
          const items = document.querySelectorAll('.item');
          if (items.length === 0) return [];

          const products: any[] = [];
          items.forEach((item) => {
            const specEl = item.querySelector('.spec') as HTMLElement;
            if (!specEl) return;

            const specLines = specEl.innerText.split('\n').map(l => l.trim()).filter(Boolean);
            
            const name = specLines[2] || specLines[0] || '';
            const nhiCode = specLines[0]?.match(/[A-Z0-9]{10}/)?.[0] || '';
            const nhiPriceMatch = specLines[1]?.match(/健保價:\s*([\d,.]+)/);
            const nhiPrice = nhiPriceMatch ? parseFloat(nhiPriceMatch[1].replace(/,/g, '')) : 0;
            
            const stockIndex = specLines.findIndex(l => l.includes('庫存'));
            const priceLine = (stockIndex > 0) ? specLines[stockIndex - 1] : '';
            
            const priceMatch = priceLine.match(/([\d,.]+)\s*\/\s*([^\n\s]+)/);
            const price = priceMatch ? parseFloat(priceMatch[1].replace(/,/g, '')) : 0;
            const unit = priceMatch ? priceMatch[2].trim() : (priceLine.includes('/') ? priceLine.split('/')[1].trim() : '單位');
            const rawStockStatus = stockIndex >= 0 ? specLines[stockIndex].replace('庫存:', '').trim() : '未知';
            const stockNumber = parseFloat(rawStockStatus.replace(/[^\d.]/g, ''));
            const stockStatus = rawStockStatus !== '未知' && !isNaN(stockNumber) && stockNumber <= 0
              ? '無庫存'
              : rawStockStatus;

            const itemText = (item as HTMLElement).innerText || '';
            const expiryMatch = itemText.match(/(\d{4}[-/]\d{2}[-/]\d{2})/);
            const expiry = expiryMatch ? expiryMatch[0] : '';

            if (name && name !== '品名(中英)') {
              products.push({
                platform,
                name: name,
                spec: specLines[3] || '',
                price: isNaN(price) ? 0 : price,
                unit: unit,
                stock: stockStatus,
                link: window.location.href,
                expiry: expiry,
                memo: '',
                nhiCode: nhiCode,
                nhiPrice: isNaN(nhiPrice) ? 0 : nhiPrice
              });
            }
          });
          return products;
        }, this.platformName)

        if (pageResults.length === 0) break;
        
        // 檢查是否跟上一頁完全一樣（避免無限迴圈）
        const currentPageSignature = JSON.stringify(pageResults.map(p => p.name + p.price));
        if ((this as any).lastPageSignature === currentPageSignature) {
          console.log('[嘉鏵] 偵測到重複資料，停止翻頁')
          break;
        }
        (this as any).lastPageSignature = currentPageSignature;

        allResults.push(...pageResults)
        console.log(`[嘉鏵] 第 ${pageCount} 頁抓取完成，目前累計 ${allResults.length} 筆`)

        // 偵測並點擊「下一頁」
        const nextBtn = await page.$('a.pnext')
        const isVisible = nextBtn ? await nextBtn.isVisible() : false
        
        if (!nextBtn || !isVisible) {
          console.log('[嘉鏵] 下一頁按鈕不存在或已隱藏，停止翻頁')
          break
        }

        // 點擊翻頁並等待
        await nextBtn.click()
        await page.waitForTimeout(2000) // 等待 AJAX 載入
        
        // 檢查頁面是否真的有變（或是檢查有沒有新的 .item 出現）
        try {
          await page.waitForSelector('.item', { timeout: 5000 })
        } catch (e) {
          console.log('[嘉鏵] 翻頁後未見新資料，停止')
          break
        }

        pageCount++
      }
    } catch (e) {
      console.log('[嘉鏵] 搜尋或翻頁過程發生錯誤:', e)
    }

    console.log(`[嘉鏵] 全部抓取完成，共 ${allResults.length} 筆`)
    return allResults
  }
}
