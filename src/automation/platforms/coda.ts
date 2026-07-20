// Coda Connector (可達藥品有限公司)
import type { Page, BrowserContext } from 'playwright'
import { Connector } from '../connector'
import type { ProductResult } from '../connector'

export class CodaConnector extends Connector {
  platformId = 'coda'
  platformName = '可達'
  baseUrl = 'https://www.codadrug.com.tw/'

  protected context: BrowserContext
  constructor(context: BrowserContext) {
    super(context)
    this.context = context
  }

  private async goToLogin(page: Page): Promise<boolean> {
    const loginUrls = [
      'https://www.codadrug.com.tw/',
      'https://www.codadrug.com.tw/Home/Index',
    ]

    for (const url of loginUrls) {
      try {
        console.log(`[Coda] Navigating to login URL: ${url}`)
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
        await page.waitForTimeout(800)
        console.log(`[Coda] Current URL after login navigation: ${page.url()}`)

        const accountVisible = await page.locator(
          'input#Account, input[name="Account"]'
        ).first().isVisible().catch(() => false)
        if (accountVisible || await this.isLoggedIn(page)) return true
      } catch (e) {
        console.warn(`[Coda] Login navigation failed for ${url}:`, e)
      }
    }

    return false
  }

  async isLoggedIn(page: Page): Promise<boolean> {
    try {
      const loginFormVisible = await page.locator(
        'input#Account, input[name="Account"]'
      ).first().isVisible().catch(() => false)
      if (loginFormVisible) return false

      const url = page.url()
      const logoutVisible = await page.locator(
        'a[href*="Logout" i], a[href*="LogOut" i], text=登出'
      ).first().isVisible().catch(() => false)

      return logoutVisible || url.includes('/Product/') || url.includes('/Order/')
    } catch {
      return false
    }
  }

  private async canUseProductSearch(page: Page): Promise<boolean> {
    const searchVisible = await page.locator(
      'input#SearchInput, input[name="SearchInput"], input[type="search"]'
    ).first().isVisible().catch(() => false)
    const loginVisible = await page.locator(
      'input#Account, input[name="Account"]'
    ).first().isVisible().catch(() => false)
    return searchVisible && !loginVisible
  }

  async login(page: Page, creds: any): Promise<boolean> {
    console.log('[Coda] Starting login flow')
    if (!(await this.goToLogin(page))) {
      console.warn(`[Coda] Login page did not become ready. Current URL: ${page.url()}`)
      return false
    }

    if (await this.isLoggedIn(page)) return true

    const account = page.locator('input#Account, input[name="Account"]').first()
    const password = page.locator('input#Password, input[name="Password"]').first()
    const submit = page.locator('input#Submit, button#Submit, input[type="submit"]').first()

    await account.waitFor({ state: 'visible', timeout: 10000 })
    await account.fill(creds.username)
    await password.fill(creds.password)

    if (await account.inputValue() !== creds.username || !(await password.inputValue())) {
      console.error('[Coda] Credential fields did not retain the filled values')
      return false
    }

    await submit.click()
    console.log(`[Coda] Submitted login form. Current URL: ${page.url()}`)

    try {
      await page.waitForFunction(() => {
        const loginForm = document.querySelector<HTMLInputElement>('input#Account, input[name="Account"]')
        const formVisible = !!loginForm && !!loginForm.offsetParent
        const url = window.location.href
        return !formVisible || url.includes('/Product/') || url.includes('/Order/')
      }, { timeout: 15000 })
    } catch {
      console.warn('[Coda] Login redirect was slow; checking current page state')
    }

    const loggedIn = await this.isLoggedIn(page)
    console.log(`[Coda] Login result=${loggedIn}, current URL=${page.url()}`)
    if (loggedIn) return true

    try {
      console.log('[Coda] Login state unclear; probing product search page')
      await page.goto('https://www.codadrug.com.tw/Product/Product', { waitUntil: 'domcontentloaded', timeout: 30000 })
      await page.waitForTimeout(1000)
      console.log(`[Coda] URL after product probe: ${page.url()}`)
      if (await this.canUseProductSearch(page)) {
        console.log('[Coda] Product search is available; treating session as logged in')
        return true
      }
    } catch (e) {
      console.warn('[Coda] Product search probe failed:', e)
    }

    if (!loggedIn) {
      const validationMessage = await page.locator(
        '.validation-summary-errors, .field-validation-error, .alert-danger, .text-danger'
      ).allTextContents().catch(() => [])
      console.warn(`[Coda] Login failed message: ${validationMessage.join(' | ') || 'no visible validation message'}`)
    }
    return false
  }

  async search(page: Page, searchTerm: string, filters?: any): Promise<ProductResult[]> {
    console.log(`[Coda] Searching for "${searchTerm}", Filters: ${JSON.stringify(filters)}`)

    if (!page.url().includes('/Product/Product')) {
      console.log('[Coda] Navigating to product search page')
      await page.goto('https://www.codadrug.com.tw/Product/Product', { waitUntil: 'domcontentloaded', timeout: 30000 })
      console.log(`[Coda] Current URL after product navigation: ${page.url()}`)
    }

    try {
      const searchTrigger = page.locator('i.fa-search, label[for="SearchInput"], .search-icon').first()
      await searchTrigger.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {})
      await searchTrigger.click({ timeout: 5000 }).catch(() => {})
      await page.waitForTimeout(300)

      const searchInput = 'input#SearchInput, input[name="SearchInput"], input[type="search"]'
      await this.fastType(page, searchInput, searchTerm)
      await page.keyboard.press('Enter')
      await page.waitForSelector('a.item, .item', { timeout: 10000 })
    } catch (e) {
      console.warn(`[Coda] Search controls failed at URL ${page.url()}:`, e)
      return []
    }

    const results: ProductResult[] = await page.evaluate((platform) => {
      const items = Array.from(document.querySelectorAll('a.item, .item'))
      return items.map((item) => {
        const text = (item as HTMLElement).innerText || ''
        const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
        const hasDrugName = text.includes('藥品') || text.includes('品名') || lines.length >= 2
        if (!hasDrugName) return null

        const nhiCodeMatch = text.match(/(?:健保碼|健保代碼|代碼)[:：\]\s]*([A-Z0-9]{10})/)
        const nhiCode = nhiCodeMatch ? nhiCodeMatch[1] : ''
        const nhiPriceMatch = text.match(/(?:健保價|健保價格)[:：\]\s]*([\d,.]+)/)
        const nhiPrice = nhiPriceMatch ? parseFloat(nhiPriceMatch[1].replace(/,/g, '')) : 0
        const nameMatch = text.match(/(?:藥品名稱|品名|藥名)[:：\]\s]*([^\n]+)/)
        const name = nameMatch ? nameMatch[1].trim() : (lines[1] || lines[0] || '可達商品')
        const pricePatternMatch = text.match(/([\d,.]+)\s*\/\s*([\d,.]+)/)
        const price = pricePatternMatch ? parseFloat(pricePatternMatch[1].replace(/,/g, '')) : 0
        const unitPrice = pricePatternMatch ? parseFloat(pricePatternMatch[2].replace(/,/g, '')) : 0
        const unitMatch = text.match(/(?:單位|包裝)[:：\]\s]*(\S+)/)
        const unit = unitMatch ? unitMatch[1] : ''
        const isOutOfStock = text.includes('缺貨') || text.includes('售完') || text.includes('補貨')

        return {
          platform,
          name,
          spec: lines[0] || '',
          price: isNaN(price) ? 0 : price,
          unitPrice: isNaN(unitPrice) ? 0 : unitPrice,
          unit,
          stock: isOutOfStock ? '缺貨' : '有庫存',
          link: (item as HTMLAnchorElement).href || window.location.href,
          expiry: '',
          nhiCode,
          nhiPrice: isNaN(nhiPrice) ? 0 : nhiPrice,
        }
      }).filter((r) => r !== null) as ProductResult[]
    }, this.platformName)

    console.log(`[Coda] Parsed ${results.length} results`)
    return results
  }
}
