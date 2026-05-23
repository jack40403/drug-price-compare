import type { Page } from 'playwright'
import { Connector } from '../connector'
import type { ProductResult } from '../connector'

export class MDTConnector extends Connector {
  platformId = 'mdt'
  platformName = '蔓達特'
  baseUrl = 'https://www.mdtky.com.tw/Member/login'

  async isLoggedIn(page: Page): Promise<boolean> {
    try {
      const currentUrl = page.url()
      return currentUrl.includes('mdtky.com.tw/Shop/') || currentUrl.includes('Product/Search')
    } catch (e) {
      return false
    }
  }

  async login(page: Page, creds: any): Promise<boolean> {
    await page.goto(this.baseUrl, { waitUntil: 'domcontentloaded' })
    if (await this.isLoggedIn(page)) return true

    await this.humanType(page, 'input#Account', creds.username)
    await this.humanType(page, 'input#PWD', creds.password)

    let alreadyNavigated = false

    if (this.captchaHandler) {
      try {
        const captchaImg = page.locator('#validimg, img#ImgCaptcha, img[src*="Captcha"]').first()
        await captchaImg.waitFor({ state: 'visible', timeout: 5000 })
        const screenshot = await captchaImg.screenshot({ type: 'png' })
        const base64Image = `data:image/png;base64,${screenshot.toString('base64')}`
        const inputSelector = '#captchaTextBox, input#Code, input[name="Code"]'

        const code = await Promise.race([
          this.captchaHandler(this.platformId, this.platformName, base64Image),
          page.waitForFunction((s) => (document.querySelector(s) as HTMLInputElement)?.value.length >= 4, inputSelector, { timeout: 60000 }).then(() => 'MANUAL'),
          page.waitForFunction(() => window.location.href.includes('Shop/'), { timeout: 60000 }).then(() => 'SUCCESS')
        ]);

        if (code === 'SUCCESS') {
          alreadyNavigated = true
        } else if (code !== 'MANUAL' && code) {
          await page.fill(inputSelector, code)
        }
      } catch (e) {
        // 沒有驗證碼圖片或超時，繼續走一般流程
      }
    }

    if (!alreadyNavigated) {
      // 核心修正：確保登入表單被送出（不論有無驗證碼）
      try {
        await page.click('button[type="submit"], input[type="submit"], button:has-text("登入"), a:has-text("登入")', { timeout: 5000 })
      } catch (e) {
        await page.keyboard.press('Enter')
      }
      try {
        await page.waitForURL(/Shop|Product|Search/, { timeout: 15000 })
        await page.goto('https://www.mdtky.com.tw/Shop/Product/index', { waitUntil: 'domcontentloaded' })
      } catch (e) {}
    }

    return await this.isLoggedIn(page)
  }

  async search(page: Page, searchTerm: string, filters?: any): Promise<ProductResult[]> {
    console.log(`[蔓達特] 啟動動態對位搜尋: "${searchTerm}"`)
    if (!page.url().includes('Shop/Product/')) {
      await page.goto('https://www.mdtky.com.tw/Shop/Product/index', { waitUntil: 'domcontentloaded' })
    }
    
    const allResults: ProductResult[] = []
    let pageCount = 1

    try {
      await this.fastType(page, '#webtxtKey, #txtKey, input.search-txt', searchTerm)
      await page.keyboard.press('Enter')
      
      while (pageCount <= 50) {
        console.log(`[蔓達特] 抓取第 ${pageCount} 頁...`)
        await page.waitForSelector('.productBox, li.pdConList, table tr', { timeout: 10000 })
        await page.waitForTimeout(2000)

        const pageResults: ProductResult[] = await page.evaluate((platform) => {
          // 1. 偵測表格模式
          const table = document.querySelector('table');
          const headerCells = table ? Array.from(table.querySelectorAll('th, td.header')) : [];
          const headers = headerCells.map(h => h.innerText.trim());
          
          if (table && headers.some(h => h.includes('品名') || h.includes('代碼'))) {
            const nameIdx = headers.findIndex(h => h.includes('品名'));
            const nhiIdx = headers.findIndex(h => h.includes('健保代碼') || h.includes('健保序號'));
            const nhiPriceIdx = headers.findIndex(h => h.includes('健保價'));
            const priceIdx = headers.findIndex(h => h.includes('售價') || h.includes('單位售價'));
            const expiryIdx = headers.findIndex(h => h.includes('效期'));

            const rows = Array.from(table.querySelectorAll('tr')).slice(1);
            return rows.map(row => {
              const cells = Array.from(row.querySelectorAll('td'));
              if (cells.length < 3) return null;
              
              const nameText = cells[nameIdx >= 0 ? nameIdx : 2]?.innerText.trim() || '';
              const [name, spec] = nameText.split('\n');
              const nhiCode = cells[nhiIdx >= 0 ? nhiIdx : 3]?.innerText.trim() || '';
              const nhiPrice = parseFloat(cells[nhiPriceIdx >= 0 ? nhiPriceIdx : 4]?.innerText.replace(/[^0-9.]/g, '') || '0');
              const price = parseFloat(cells[priceIdx >= 0 ? priceIdx : 5]?.innerText.replace(/[^0-9.]/g, '') || '0');
              const expiry = cells[expiryIdx >= 0 ? expiryIdx : 6]?.innerText.trim() || '';

              return {
                platform, name: name || '未知', spec: spec || '', price, unit: '單位',
                stock: row.innerText.includes('售完') ? '售完' : '有供貨',
                link: window.location.href, expiry, nhiCode, nhiPrice
              };
            }).filter(Boolean) as ProductResult[];
          }

          // 2. 偵測方塊模式 (根據 F12 診斷結果對位)
          const cards = Array.from(document.querySelectorAll('.productBox, .pdConList, .pdList li'));
          return cards.map(card => {
            const lines = (card as HTMLElement).innerText.split('\n').map(l => l.trim()).filter(Boolean);
            if (lines.length < 3) return null;

            // 根據 F12: [0]產品代碼, [1]品名/規格, [3]健保碼
            const nameSpec = lines[1] || '';
            const [name, ...specParts] = nameSpec.split(' ');
            const spec = specParts.join(' ');
            
            const nhiLine = lines.find(l => l.match(/[A-Z][A-Z0-9][0-9]{8}/)) || '';
            const nhiCode = nhiLine.match(/[A-Z][A-Z0-9][0-9]{8}/)?.[0] || '';
            const nhiPriceMatch = nhiLine.match(/健保價\s*[:：]\s*([\d,.]+)/);
            const nhiPrice = nhiPriceMatch ? parseFloat(nhiPriceMatch[1].replace(/,/g, '')) : 0;

            const priceLine = lines.find(l => l.includes('$')) || '';
            const price = parseFloat(priceLine.replace(/[^0-9.]/g, '') || '0');
            const expiryLine = lines.find(l => l.includes('效期')) || '';
            const expiry = expiryLine.split(':').pop()?.trim() || '';

            return {
              platform, name: name || '未知', spec, price, unit: '單位',
              stock: (card as HTMLElement).innerText.includes('售完') ? '售完' : '有供貨',
              link: window.location.href, expiry, nhiCode, nhiPrice
            };
          }).filter(Boolean) as ProductResult[];
        }, this.platformName)

        if (pageResults.length === 0) break;
        allResults.push(...pageResults)

        const nextBtn = await page.$('a.btn-next')
        if (!nextBtn || !(await nextBtn.isVisible())) break
        await nextBtn.click()
        await page.waitForTimeout(3000)
        pageCount++
      }
    } catch (e) { console.error(e); }
    return allResults
  }
}
