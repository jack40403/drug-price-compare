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
      return currentUrl.includes('mdtky.com.tw/Shop/') || currentUrl.includes('Product/Search') || (currentUrl === 'https://www.mdtky.com.tw/')
    } catch (e) {
      return false
    }
  }

  async login(page: Page, creds: any): Promise<boolean> {
    console.log('[蔓達特] 正在導向登入頁面...')
    await page.goto(this.baseUrl, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1000)

    if (await this.isLoggedIn(page)) return true

    console.log('[蔓達特] 正在打字輸入帳密 (擬人化)...')
    await this.fastType(page, 'input#Account', creds.username)
    await this.fastType(page, 'input#PWD', creds.password)

    if (this.captchaHandler) {
      try {
        console.log('[蔓達特] 偵測驗證碼圖片...')
        const captchaImg = page.locator('#validimg, img#ImgCaptcha, img[src*="Captcha"]').first()
        await captchaImg.waitFor({ state: 'visible', timeout: 5000 })

        const screenshot = await captchaImg.screenshot({ type: 'png' })
        const base64Image = `data:image/png;base64,${screenshot.toString('base64')}`

        console.log('[蔓達特] 已截取驗證碼，正在請求使用者輸入...')
        const code = await this.captchaHandler(this.platformId, this.platformName, base64Image)

        console.log(`[蔓達特] 收到輸入: ${code}，正在自動填入並登入...`)
        await page.waitForTimeout(500)
        const inputSelector = '#captchaTextBox, input#Code, input[name="Code"]'
        await page.fill(inputSelector, code)
        await page.keyboard.press('Enter')
        await page.click('input[type="submit"], input[value="登入"], #btnsend').catch(() => {})
      } catch (e) {
        console.log('[蔓達特] 無法自動定位驗證碼，切換回手動等待模式...')
      }
    }

    try {
      console.log('[蔓達特] 等待登入狀態確認...')
      await page.waitForFunction(() => {
        const url = window.location.href
        return url.includes('mdtky.com.tw/Shop/') || url.includes('Product/Search') || (url === 'https://www.mdtky.com.tw/')
      }, { timeout: 120000 })

      console.log('[蔓達特] 偵測到登入成功，正在跳轉至產品搜尋頁面...')
      await page.goto('https://www.mdtky.com.tw/Shop/Product/', { waitUntil: 'domcontentloaded' })
    } catch (e) {
      console.warn('[蔓達特] 登入超時，請檢查驗證碼是否正確。')
    }

    return true
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
