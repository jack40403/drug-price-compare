import type { Page, BrowserContext } from 'playwright'

export interface ProductResult {
  platform: string;
  name: string;
  spec: string;
  price: number;
  unit: string;
  stock: string;
  link: string;
  expiry?: string;
  memo?: string;
  nhiCode?: string;
  nhiPrice?: number;
  unitPrice?: number;
}

export abstract class Connector {
  abstract platformId: string;
  abstract platformName: string;
  abstract baseUrl: string;

  protected context: BrowserContext;
  public captchaHandler?: (platformId: string, platformName: string, image: string) => Promise<string>;

  constructor(context: BrowserContext, captchaHandler?: (platformId: string, platformName: string, image: string) => Promise<string>) {
    this.context = context;
    this.captchaHandler = captchaHandler;
  }

  /**
   * 極速輸入 (直接貼上模式)
   * 用於搜尋框，實現零延遲
   */
  protected async fastType(page: Page, selector: string, text: string) {
    const input = page.locator(selector).filter({ visible: true }).first();
    await input.waitFor({ state: 'visible', timeout: 5000 });
    await input.click();
    // 直接使用 fill 達成瞬間貼入效果
    await input.fill(text);
  }

  /**
   * 擬人化輸入 (已加速至 2ms)
   */
  async humanType(page: Page, selector: string, text: string) {
    const element = page.locator(selector).filter({ visible: true }).first();
    await element.waitFor({ state: 'visible' });
    await element.focus();

    // 關鍵改善：打字前先全選並刪除原本的內容
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(50); // 縮短停頓時間

    for (const char of text) {
      await page.keyboard.type(char, { delay: 2 }); // 固定 2ms 延遲
    }
  }

  /**
   * Check if the current state is "Logged In"
   */
  abstract isLoggedIn(page: Page): Promise<boolean>;

  /**
   * Perform the login sequence
   */
  abstract login(page: Page, creds: any): Promise<boolean>;

  /**
   * Search for a product and return results
   */
  abstract search(page: Page, searchTerm: string, filters?: any): Promise<ProductResult[]>;

  /**
   * Common helper to navigate and ensure login
   * Now with focus on session persistence:
   * Only navigates and logs in if not already on the site or not logged in.
   */
  async ensureLoggedIn(page: Page, creds: any): Promise<boolean> {
    const currentUrl = page.url()
    // If not even on the right domain or on about:blank, go there
    if (currentUrl === 'about:blank' || !currentUrl.includes(this.baseUrl.split('/')[2])) {
      console.log(`[${this.platformName}] Navigating to base URL: ${this.baseUrl}`);
      await page.goto(this.baseUrl, { waitUntil: 'domcontentloaded' });
    }

    const loggedIn = await this.isLoggedIn(page);
    if (!loggedIn) {
      console.log(`[${this.platformName}] Session invalid, attempting login...`);
      return await this.login(page, creds);
    }
    
    console.log(`[${this.platformName}] Session active, reuse confirmed.`);
    return true;
  }
}
