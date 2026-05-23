import type { Page } from 'playwright'
import { Connector } from '../connector'
import type { ProductResult } from '../connector'

export class TaichungConnector extends Connector {
  platformId = 'taichung'
  platformName = '泰昌藥品'
  baseUrl = 'https://taichung-pc.com.tw/index.php'

  async isLoggedIn(page: Page): Promise<boolean> {
    const loginBtn = await page.$('a.signin.gosign')
    const isLoggedIn = loginBtn === null
    console.log(`[Taichung] Logged in status: ${isLoggedIn}`)
    return isLoggedIn
  }

  async login(page: Page, creds: any): Promise<boolean> {
    console.log('[Taichung] Navigating to home page...')
    await page.goto(this.baseUrl, { waitUntil: 'domcontentloaded' })

    if (await this.isLoggedIn(page)) return true

    console.log('[Taichung] Opening login modal...')
    await page.click('a.signin.gosign')
    await page.waitForTimeout(1000)

    console.log('[泰昌] 正在輸入帳密 (擬人化)...')
    await this.fastType(page, "input[placeholder='請輸入登入帳號']", creds.username)
    await this.fastType(page, "input[placeholder='請輸入登入密碼']", creds.password)

    console.log('[Taichung] Clicking login button...')
    await page.click('a#ulogin_submit')

    await page.waitForTimeout(4000)

    const success = await this.isLoggedIn(page)
    if (!success) {
      console.warn('[Taichung] Login attempt failed.')
    }
    return success
  }

  async search(page: Page, searchTerm: string, filters?: any): Promise<ProductResult[]> {
    console.log(`[泰昌] 正準備搜尋: "${searchTerm}", Filters: ${JSON.stringify(filters)}`)
    // 根據手動勾選決定欄位
    const isCode = filters?.code === true;
    const isComponent = filters?.component === true;
    const targetUrl = 'https://taichung-pc.com.tw/order.php?act=order'
    const targetSelector = isCode ? 'input[name="hid"]' : isComponent ? 'input[name="emt_drug"]' : 'input[name="drug"]'
    const fieldName = isCode ? '健保碼' : isComponent ? '成分' : '品名'

    console.log(`[泰昌] ===============================`)
    console.log(`[泰昌] 判定結果: ${fieldName}`)
    console.log(`[泰昌] 動作: 跳轉至訂購頁並填入 ${fieldName} 欄位`)
    console.log(`[泰昌] ===============================`)

    // 1. 強力跳轉至訂購搜尋頁 (不論目前在哪)
    if (!page.url().includes('order.php?act=order')) {
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded' })
    }

    try {
      await page.waitForSelector(targetSelector, { timeout: 8000 })
      
      console.log(`[泰昌] 執行極速貼入 -> 欄位: ${targetSelector}`)
      await this.fastType(page, targetSelector, searchTerm)
      
      // 點擊搜尋按鈕
      const searchBtn = await page.$('button.search.button, button.multi.search')
      if (searchBtn) {
        await searchBtn.click()
      } else {
        await page.keyboard.press('Enter')
      }
      
      await page.waitForTimeout(2000)
    } catch (e) {
      console.warn(`[泰昌] ${fieldName} 搜尋流程發生異常:`, e)
      return []
    }

    // 處理公告彈窗
    const postAlert = await page.$('button.confirm.button')
    if (postAlert) {
      await postAlert.click()
      await page.waitForTimeout(500)
    }

    console.log('[Taichung] Waiting for results...')
    try {
      await page.waitForFunction(() => {
        const t = document.body.innerText;
        return t.includes('健保') || t.includes('產品列表') || t.includes('搜尋結果');
      }, { timeout: 10000 })
      await page.waitForTimeout(1500)
    } catch (e) {
      return []
    }

    const results: ProductResult[] = await page.evaluate((platform) => {
      try {
        // 1. 抓取所有產品卡片 (li.item 才是獨立的藥品單元)
        const cards = Array.from(document.querySelectorAll('li.item')).filter(el => {
          return el.querySelector('.nhi-code') !== null || el.querySelector('h3') !== null;
        });

        return cards.map((card) => {
          // 1. 品名 (H3)
          const nameEl = card.querySelector('h3');
          const name = nameEl ? nameEl.innerText.trim() : '未知藥品';

          // 2. 健保代碼 (.nhi-code)
          const nhiCodeEl = card.querySelector('.nhi-code');
          const nhiCode = nhiCodeEl ? nhiCodeEl.innerText.trim() : '';

          // 3. 健保價 (.nhi-price)
          const nhiPriceEl = card.querySelector('.nhi-price');
          const nhiPrice = nhiPriceEl ? parseFloat(nhiPriceEl.innerText.replace(/[^0-9.]/g, '')) : 0;

          // 4. 效期 (.lifetime)
          const expiryEl = card.querySelector('.lifetime');
          const expiry = expiryEl ? expiryEl.innerText.trim() : '';

          // 5. 售價 (.price)
          const priceEl = card.querySelector('.price');
          const price = priceEl ? parseFloat(priceEl.innerText.replace(/[^0-9.]/g, '')) : 0;

          // 6. 單位 (.unit)
          const unitEl = card.querySelector('.unit');
          const unit = unitEl ? unitEl.innerText.replace(/\//g, '').trim() : '單位';

          // 7. 庫存 (.stock)
          const stockEl = card.querySelector('.stock');
          const stockStatus = stockEl ? stockEl.innerText.trim() : '有供貨';

          // 8. 單價換算 (從品名找數量)
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
            stock: stockStatus,
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
