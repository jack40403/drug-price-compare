import { app, BrowserWindow, ipcMain, safeStorage, dialog } from 'electron'
import path, { join } from 'path'
import fs from 'fs'
import http from 'http'
import { parse as parseUrl } from 'url'
import type { Page, BrowserContext, Browser } from 'playwright'
import { chromium } from 'playwright'
import Store from './store'
import { BinLiConnector } from '../src/automation/platforms/binli'
import { ChahwaConnector } from '../src/automation/platforms/chahwa'
import { JhaoHongConnector } from '../src/automation/platforms/jhaohong'
import { YesChainConnector } from '../src/automation/platforms/yeschain'
import { YuShengConnector } from '../src/automation/platforms/yusheng'
import { MDTConnector } from '../src/automation/platforms/mdt'
import { CodaConnector } from '../src/automation/platforms/coda'
import { YCConnector } from '../src/automation/platforms/yc'
import { TaichungConnector } from '../src/automation/platforms/taichung'
import { Connector } from '../src/automation/connector'
import iconv from 'iconv-lite'
import readline from 'readline'

function fullToHalf(s: string) {
  if (!s) return '';
  return s.toString().replace(/[\uFF01-\uFF5E]/g, function (ch) {
    return String.fromCharCode(ch.charCodeAt(0) - 0xFEE0);
  }).replace(/\u3000/g, ' ');
}

/**
 * 專業級資料清洗：去除 Big5 轉換殘留的亂碼與冗於空白
 */
function cleanClinicalString(s: string): string {
  if (!s) return '';
  // 1. 去除控制字元與 null bytes
  let text = s.replace(/[\x00-\x1F\x7F]/g, '');
  // 2. 處理常見 Big5 轉碼失敗字元 (, ?, 等)
  text = text.replace(/\uFFFD/g, '').replace(/\?/g, '');
  // 3. 去除重複空白
  text = text.replace(/\s+/g, ' ');
  return text.trim();
}

function normalizeName(s: string) {
  if (!s) return '';
  // 1. 轉半形並轉小寫
  let text = fullToHalf(s).toLowerCase();
  // 2. 處理健保檔特有的尾隨格式 (切割掉空格或逗號後的部分)
  text = text.split(/[\s,，]/)[0];
  // 3. 去除標點與常用單位對齊
  return text.replace(/[()（）\[\]]/g, '')
    .replace(/[""〝〞]/g, '')
    .replace(/毫克|公絲|毫升/g, 'mg')
    .replace(/微克/g, 'mcg')
    .trim();
}

function logToFile(message: string) {
  const logPath = path.join(process.cwd(), 'debug.log');
  const timestamp = new Date().toISOString();
  const mem = (process.memoryUsage().rss / 1024 / 1024).toFixed(2);
  const formattedMessage = `[${timestamp}] [MEM: ${mem}MB] ${message}\n`;
  try {
    fs.appendFileSync(logPath, formattedMessage, 'utf8');
    console.log(formattedMessage.trim());
  } catch (err) {
    console.error('Failed to write to debug.log:', err);
  }
}

/**
 * 分段寫入大型 JSON 檔案以節省記憶體
 */
async function writeJsonSegmented(filePath: string, data: any[]) {
  return new Promise((resolve, reject) => {
    const stream = fs.createWriteStream(filePath, { encoding: 'utf8' });
    stream.write('[\n');
    let index = 0;
    
    function writeNext() {
      let canContinue = true;
      while (index < data.length && canContinue) {
        const chunk = JSON.stringify(data[index]) + (index === data.length - 1 ? '' : ',\n');
        canContinue = stream.write(chunk);
        index++;
      }
      
      if (index === data.length) {
        stream.write('\n]');
        stream.end();
      }
    }

    stream.on('drain', writeNext);
    stream.on('finish', () => resolve(true));
    stream.on('error', reject);
    
    writeNext();
  });
}

const store = new Store('drug-price-compare')

process.env.DIST = path.join(__dirname, '../dist')
process.env.VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'] as string

let win: BrowserWindow | null

// 單一視窗實例鎖定：若已有另一個執行個體，則聚焦既有視窗並退出
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })
  app.whenReady().then(createWindow)
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit()
      win = null
    }
  })
}

/**
 * AutomationManager
 * Manages a persistent browser context and a pool of pages for each platform
 */
class AutomationManager {
  private browser: Browser | null = null
  private context: BrowserContext | null = null
  private pages: Map<string, Page> = new Map()

  private headless: boolean = false

  setHeadless(headless: boolean) {
    console.log(`[Manager] Setting headless mode to: ${headless}`)
    this.headless = headless
  }

  async getContext(): Promise<BrowserContext> {
    if (!this.browser) {
      this.browser = await chromium.launch({ 
        headless: this.headless,
        slowMo: this.headless ? 0 : 150 
      })
    }
    if (!this.context) {
      this.context = await this.browser.newContext()
    }
    return this.context
  }

  async getPageForPlatform(platformId: string): Promise<Page> {
    const context = await this.getContext()
    if (this.pages.has(platformId)) {
      const page = this.pages.get(platformId)!
      // Test if page is still alive
      if (!page.isClosed()) return page
    }
    
    console.log(`[Manager] Creating new page for ${platformId}`)
    const newPage = await context.newPage()
    this.pages.set(platformId, newPage)
    return newPage
  }

  async interruptPages() {
    console.log('[Manager] Interrupting all active pages...')
    for (const page of this.pages.values()) {
      try {
        if (!page.isClosed()) await page.close()
      } catch (e) {
        // Ignore errors during close
      }
    }
    this.pages.clear()
  }

  async closeAll() {
    await this.interruptPages()
    if (this.context) await this.context.close()
    if (this.browser) await this.browser.close()
    this.context = null
    this.browser = null
  }
}

const automationManager = new AutomationManager()
let isSearchInterrupted = false
let pendingCaptchas: any[] = []

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
    title: '藥師比價專家 - V2',
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL as string)
  } else {
    win.loadFile(join(process.env.DIST as string, 'index.html'))
  }

  // --- Start HTTP Bridge Server ---
  startHttpBridge();

  // Handle initial mode from environment variable
  if (process.env.APP_MODE) {
    const isPython = process.env.APP_MODE.toLowerCase() === 'python'
    automationManager.setHeadless(isPython)
    // We'll send this to the frontend once it's ready
    win.webContents.on('did-finish-load', () => {
      win?.webContents.send('init-mode', process.env.APP_MODE)
    })
  }
}

// IPC Handlers
ipcMain.handle('get-credentials', (_event, platformId) => {
  const creds: any = (store as any).get(`creds.${platformId}`)
  if (creds && creds.password) {
    try {
      const decrypted = safeStorage.decryptString(Buffer.from(creds.password, 'base64'))
      return { ...creds, password: decrypted }
    } catch (e) {
      return creds
    }
  }
  return null
})

ipcMain.handle('save-credentials', (_event, { platformId, username, password }) => {
  const encrypted = safeStorage.encryptString(password).toString('base64')
  ;(store as any).set(`creds.${platformId}`, { username, password: encrypted })
  return { success: true }
})

ipcMain.handle('perform-search', async (_event, { searchTerm, platforms, filters }) => {
  return await performSearch(searchTerm, platforms, filters);
});

// 定義統一的驗證碼處理函式
const handleRequestCaptcha = async (platformId: string, platformName: string, image: string): Promise<string> => {
  return new Promise((resolve) => {
    console.log(`[Main] 收到驗證碼請求: ${platformName}`);
    
    // 存入全域隊列 (供手機端輪詢)
    pendingCaptchas.push({
      platformId,
      platformName,
      image,
      resolve
    });

    // 通知電腦前端 (IPC)
    win?.webContents.send('request-captcha', { platformId, platformName, image });
  });
};

ipcMain.handle('submit-captcha', async (_event, { platformId, code }) => {
  console.log(`[Main] 收到驗證碼提交: ${platformId} = ${code}`);
  const req = pendingCaptchas.find(r => r.platformId === platformId);
  if (req && req.resolve) {
    req.resolve(code);
    pendingCaptchas = pendingCaptchas.filter(r => r.platformId !== platformId);
    return { success: true };
  }
  return { success: false, error: 'Request not found or expired' };
});

async function performSearch(searchTerm: string, platforms: string[], filters?: any) {
  console.log(`[Main] Starting concurrent search for: "${searchTerm}", Filters: ${JSON.stringify(filters)}`)
  
  // 啟動搜尋時清空所有舊的驗證碼狀態
  pendingCaptchas = [];
  win?.webContents.send('clear-captchas');
  isSearchInterrupted = false
  
  const context = await automationManager.getContext()
  
  const connectors: Connector[] = [
    new BinLiConnector(context, handleRequestCaptcha),
    new ChahwaConnector(context, handleRequestCaptcha),
    new JhaoHongConnector(context, handleRequestCaptcha),
    new YesChainConnector(context, handleRequestCaptcha),
    new YuShengConnector(context, handleRequestCaptcha),
    new CodaConnector(context, handleRequestCaptcha),
    new MDTConnector(context, handleRequestCaptcha),
    new YCConnector(context, handleRequestCaptcha),
    new TaichungConnector(context, handleRequestCaptcha),
  ].filter(c => platforms.includes(c.platformId))

  const searchTasks = connectors.map(async (connector) => {
    try {
      if (isSearchInterrupted) return []

      const creds: any = (store as any).get(`creds.${connector.platformId}`)
      if (!creds) return []

      const page = await automationManager.getPageForPlatform(connector.platformId)
      const decryptedPassword = safeStorage.decryptString(Buffer.from(creds.password, 'base64'))
      
      const success = await connector.ensureLoggedIn(page, { ...creds, password: decryptedPassword })
      
      // 關鍵修正：登入程序結束後（不論成功失敗），通知前端關閉該平台的驗證碼視窗
      win?.webContents.send('clear-captcha-for-platform', connector.platformId);
      
      if (isSearchInterrupted) return []
      
      if (success) {
        return await connector.search(page, searchTerm, filters)
      }
      return []
    } catch (e) {
      if (isSearchInterrupted) {
        console.log(`[Main] Search for ${connector.platformId} interrupted.`)
      } else {
        console.error(`[Main] Error in automation task for ${connector.platformId}:`, e)
      }
      return []
    }
  })

  const resultsArrays = await Promise.all(searchTasks)
  const results = resultsArrays.flat()

  // Find cheapest
  if (results.length > 0) {
    const minPrice = Math.min(...results.filter((r: any) => r.price > 0).map((r: any) => r.price))
    results.forEach((r: any) => { if (r.price === minPrice && r.price > 0) r.isCheapest = true })
  }

  return results
}

async function processNhiTxt(event: any, filePaths: string[]) {
  console.log(`[Main] Starting integrated indexing: ${filePaths.length} files`)
  const db = new Map<string, any>()
  
  // 1. Preload Appearance Data for integration (License Map & Name Map)
  const appearanceMap = new Map();
  const apNameMap = new Map(); // 用名稱作為索引的備用地圖
  
  const appearancePath = path.join(process.cwd(), '藥品外觀/42_5.json');
  if (fs.existsSync(appearancePath)) {
    try {
      const rawAp = JSON.parse(fs.readFileSync(appearancePath, 'utf8'));
      rawAp.forEach((item: any) => {
        const entry = {
          img: item.外觀圖檔連結 || '',
          sh: item.形狀 || '',
          cl: item.顏色 || '',
          b1: item.標註一 || '',
          b2: item.標註二 || '',
          sz: item.外觀尺寸 || ''
        };

        if (item.許可證字號) {
          appearanceMap.set(item.許可證字號.trim(), entry);
        }
        if (item.中文品名) {
          // 儲存原始及去標點符號的名稱
          const cleanName = item.中文品名.trim().replace(/[()]/g, '');
          apNameMap.set(cleanName, entry);
          apNameMap.set(item.中文品名.trim(), entry);
        }
      });
      console.log(`[Main] Preloaded ${appearanceMap.size} licenses and ${apNameMap.size} names for appearance mapping.`);
    } catch (e) {
      console.error('[Main] Failed to preload appearance data:', e);
    }
  }

  // 全新重建：從空白 Map 開始，避免舊資料（含亂碼）阻擋新解析結果
  // (不預填 nhiDatabase，確保每一筆都以最新解析結果為準)

  let totalProcessed = 0
  
  for (const filePath of filePaths) {
    if (!fs.existsSync(filePath)) continue
    
    const fileStream = fs.createReadStream(filePath, { encoding: 'binary' })
    const rl = readline.createInterface({
      input: fileStream,
      terminal: false
    })

    for await (const lineText of rl) {
      totalProcessed++
      
      // Progress Notification (Every 10000 lines)
      if (totalProcessed % 10000 === 0) {
        event.sender.send('update-progress', { 
          status: 'processing', 
          count: totalProcessed,
          currentFile: path.basename(filePath)
        })
      }

      const lineBuf = Buffer.from(lineText, 'binary') 
      if (lineBuf.length < 50) continue

      try {
        // --- 11504 版專用格式偵測 ---
        const isMaster = lineBuf.length > 900;
        
        const decode = (start: number, end: number) => {
            if (start >= lineBuf.length) return '';
            const sliceEnd = Math.min(end, lineBuf.length);
            return iconv.decode(lineBuf.slice(start, sliceEnd), 'cp950').trim();
        };

        // 健保代碼定位 (原廠藥可能以 BC, B0, A 等開頭，格式較廣)
        let code = lineBuf.slice(17, 27).toString().trim();
        const isStandardCode = /^[A-Z]{1,2}[0-9]{7,9}$/.test(code) && code.length === 10;
        
        if (!isStandardCode) {
            // Anchor Search: 在前 100 bytes 中尋找 10 碼英數組合
            const match = lineBuf.slice(0, 100).toString('binary').match(/[A-Z]{1,3}[0-9]{6,9}/);
            if (match && match[0].length >= 8) {
                code = match[0].padEnd(10, ' ').slice(0, 10);
            } else {
                continue; // 真的找不到有效的代碼
            }
        }

        const priceStr = lineBuf.slice(27, 42).toString().trim();
        const dateEnd = lineBuf.slice(45, 53).toString().trim();  // 效期終止日
        const nameEn = decode(54, 250);  // 英文品名從 offset 54 開始

        let nameCnFull = '';
        let ingredients: string[] = [];
        let manufacturer = '';
        let license = '';

        if (isMaster) {
          // --- 11504 深度解析 ---
          ingredients = [decode(250, 450), decode(900, 1100), decode(1200, 1400)].filter(i => i.length > 2);
          license = decode(484, 550).split('\x00')[0];
          manufacturer = decode(600, 760); 
          nameCnFull = decode(771, 971); 
        } else {
          nameCnFull = decode(250, 450);
          ingredients = [decode(450, 700)];
          manufacturer = decode(700, 850);
          license = decode(484, 550).split('\x00')[0];
        }

        const price = parseFloat(priceStr) || 0
        const cleanedCn = cleanClinicalString(nameCnFull);
        const cleanedLic = cleanClinicalString(license);

        // --- 智慧過濾：移除 0 元垃圾，但保留專案/罕見藥 ---
        const isSpecialProject = /專案|罕見|緊急|核准/.test(cleanedCn) || /專案|罕見|緊急|核准/.test(cleanedLic);
        
        if (price > 0 || isSpecialProject) {
          const existing = db.get(code)
          const isNewer = !existing || parseIntUnsafe(dateEnd) > parseIntUnsafe(existing.d);
          
          if (isNewer) {
            let combinedIng = ingredients
              .map(i => cleanClinicalString(i))
              .filter((v, i, a) => v && a.indexOf(v) === i)
              .join(' + ');

            if (!combinedIng && cleanedCn.includes(' ')) {
              const parts = cleanedCn.split(/\s{2,}/);
              if (parts.length > 1) combinedIng = parts[parts.length - 1];
            }

            const brandCn = cleanedCn.split(/\s+/)[0].replace(/[()]/g, '');

            const entry: any = {
              c: code,
              p: price,
              n: cleanClinicalString(nameEn),
              n_cn: cleanedCn,
              br: brandCn,
              br_en: cleanClinicalString(nameEn.split(/\s+/)[0]).replace(/[()]/g, ''),
              ing: combinedIng,
              ds: (nameEn.match(/(\d+\.?\d*\s?(MG|ML|%|GM|IU))/i) || [])[0]?.toUpperCase() || '',
              m: cleanClinicalString(manufacturer),
              d: dateEnd,
              lic: cleanedLic
            };

            // 整合外觀
            if (license && appearanceMap.has(license)) {
              Object.assign(entry, appearanceMap.get(license));
            } else {
              const match = apNameMap.get(entry.br) || apNameMap.get(entry.n_cn.split(' ')[0]);
              if (match) Object.assign(entry, match);
            }

            db.set(code, entry)
          }
        }
      } catch (e) {
        // Skip
      }
    }
  }

  function parseIntUnsafe(s: string) { return parseInt(s) || 0; }

  const finalResults = Array.from(db.values())
  nhiDatabase = finalResults
  
  const outputPath = path.join(process.cwd(), 'src/assets/nhi_index.json')
  try {
    await writeJsonSegmented(outputPath, finalResults);
    console.log(`[Main] Database updated segmented. Unique: ${finalResults.length}`)
  } catch (err: any) {
    console.error('[Main] Failed to save index via stream:', err)
  }
  
  return { success: true, count: finalResults.length }
}

ipcMain.handle('process-nhi-txt', (event, filePaths: string[]) => processNhiTxt(event, filePaths));


ipcMain.handle('open-file-dialog', async (event) => {
  const result = await dialog.showOpenDialog({
    title: '選擇健保 TXT 資料檔 (可多選)',
    filters: [{ name: 'NHI Source Files', extensions: ['txt', 'TXT', 'b5', 'B5'] }],
    properties: ['openFile', 'multiSelections']
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { success: false, count: 0 };
  }

  logToFile(`使用者選擇了 ${result.filePaths.length} 個檔案: ${result.filePaths.join(', ')}`);
  return processNhiTxt(event, result.filePaths);
});

// 自動掃描安裝目錄中的全部 NHI TXT / B5
ipcMain.handle('auto-index-nhi', async (event) => {
  const NHI_DIR = path.join(process.cwd(), '健保藥品離線資料庫');
  logToFile(`自動掃描健保資料庫: ${NHI_DIR}`);

  if (!fs.existsSync(NHI_DIR)) {
    logToFile(`找不到資料庫目錄: ${NHI_DIR}`);
    return { success: false, count: 0, error: '找不到健保藥品離線資料庫資料夾' };
  }

  const allFiles = fs.readdirSync(NHI_DIR)
    .filter(f => /\.(txt|b5)$/i.test(f))
    .map(f => path.join(NHI_DIR, f));

  if (allFiles.length === 0) {
    return { success: false, count: 0, error: '資料夾中沒有找到 .TXT 或 .b5 檔案' };
  }

  logToFile(`找到 ${allFiles.length} 個檔案: ${allFiles.join(', ')}`);
  return processNhiTxt(event, allFiles);
});

ipcMain.handle('interrupt-search', async () => {
  console.log('[Main] Interrupting search...')
  isSearchInterrupted = true
  await automationManager.interruptPages()
  return { success: true }
})

ipcMain.handle('close-connections', async () => {
  await automationManager.closeAll()
  return { success: true }
})

ipcMain.handle('set-automation-mode', async (_event, { headless }) => {
  automationManager.setHeadless(headless)
  return { success: true }
})


// --- Drug Appearance Database ---
let drugAppearanceMap: Map<string, any> = new Map()
let drugNameAppearanceMap: Map<string, any> = new Map() // Secondary index for name-based lookup

async function loadDrugAppearance() {
  logToFile('正在載入藥品外觀資料庫...')
  try {
    const appearancePath = path.join(process.cwd(), '藥品外觀/42_5.json')
    if (fs.existsSync(appearancePath)) {
      const data = JSON.parse(fs.readFileSync(appearancePath, 'utf8'))
      const map = new Map()
      const nameMap = new Map()
      
      data.forEach((item: any) => {
        if (item.許可證字號) {
          const lic = item.許可證字號.trim()
          map.set(lic, item)
        }
        if (item.中文品名) {
          nameMap.set(item.中文品名.trim().toLowerCase(), item)
        }
      })
      
      drugAppearanceMap = map
      drugNameAppearanceMap = nameMap
      logToFile(`藥品外觀資料載入完成，共 ${map.size} 筆有效許可證。`)
    } else {
      logToFile('警告: 找不到 藥品外觀/42_5.json')
    }
  } catch (err: any) {
    logToFile(`載入藥品外觀資料發生錯誤: ${err.message}`)
  }
}

ipcMain.handle('get-drug-appearance', (_, { license, name, nhiCode }) => {
  return getDrugAppearance(license, name, nhiCode);
})

function getDrugAppearance(license: string, name: string, nhiCode: string) {
  logToFile(`查詢藥品外觀: lic=${license}, name=${name}, nhiCode=${nhiCode}`)
  
  // 1. 優先以許可證字號查詢 (O(1))
  const cleanLic = (license || '').toString().trim()
  if (cleanLic && drugAppearanceMap.has(cleanLic)) {
    return drugAppearanceMap.get(cleanLic)
  }

  // 1.5 備案：如果傳遞了健保代碼，且記憶體中的資料庫已經整合過外觀，則直接回傳
  if (nhiCode) {
    const item = nhiDatabase.find(i => i.c === nhiCode);
    if (item && (item.img || item.sh)) {
      return item;
    }
  }
  
  // 2. 備案：名稱快取精確查詢 (O(1))
  if (name) {
    const cleanName = name.trim().toLowerCase()
    const possibleNames = [
      cleanName,
      cleanName.replace(/[()（）]/g, ''), // 去除括號
      cleanName.split(' ')[0], // 拿第一個單詞 (通常是廠牌+品名)
      cleanName.replace(/"/g, '') // 去除引號
    ]
    
    for (const n of possibleNames) {
      if (drugNameAppearanceMap.has(n)) {
        return drugNameAppearanceMap.get(n)
      }
    }
    
    // 3. 極限備案：模糊匹配 (流式搜尋，避免造成主線程過度阻塞)
    for (const item of drugNameAppearanceMap.values()) {
      const cn = (item.中文品名 || '').toLowerCase()
      if (cn.length > 2 && (cn.includes(cleanName) || cleanName.includes(cn))) {
        return item
      }
    }
  }
  
  return null
}

ipcMain.handle('ping', () => {
  logToFile('IPC Ping received');
  return 'pong';
});

// --- NHI Local Database Indexing (Memory-Resident for performance) ---
let nhiDatabase: any[] = [];

async function loadNhiDatabase() {
  logToFile('開始執行 loadNhiDatabase...');
  try {
    const possiblePaths = [
      path.join(process.cwd(), 'src/assets/nhi_index.json'),
      path.join(__dirname, '../src/assets/nhi_index.json'),
      path.join(__dirname, 'assets/nhi_index.json')
    ];

    let dbPath = '';
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        dbPath = p;
        break;
      }
    }

    if (dbPath) {
      logToFile(`找到資料庫路徑: ${dbPath}`);
      // 非同步讀取，避免阻塞主執行緒 IPC
      const raw = await fs.promises.readFile(dbPath, 'utf8');
      nhiDatabase = JSON.parse(raw);
      logToFile(`資料庫加載完成，共 ${nhiDatabase.length} 筆。`);
    } else {
      logToFile('錯誤: 找不到 nhi_index.json');
    }
  } catch (err: any) {
    logToFile(`加載資料庫嚴重錯誤: ${err.message}`);
  }
}

// 在 App 啟動時即載入
loadNhiDatabase();
loadDrugAppearance();

ipcMain.handle('reload-nhi-db', async () => {
  return await reloadNhiDb();
});

async function reloadNhiDb() {
  logToFile('手動要求重新載入健保資料庫...');
  await loadNhiDatabase();
  return { success: true, count: nhiDatabase.length };
}

ipcMain.handle('integrate-appearance', async () => {
  return await integrateAppearance();
});

async function integrateAppearance() {
  logToFile('開始執行外觀資料一鍵整合 (強化比對模式)...');
  if (nhiDatabase.length === 0) {
    await loadNhiDatabase();
  }
  if (drugAppearanceMap.size === 0) {
    await loadDrugAppearance();
  }

  let matchCount = 0;
  nhiDatabase.forEach((item: any) => {
    // 只有在目前沒有圖片時才進行配對，避免覆蓋既有正確資料
    if (!item.img) {
      const norm = normalizeName(item.br || item.n_cn || item.n);
      const match = (item.lic && drugAppearanceMap.get(item.lic)) || drugNameAppearanceMap.get(norm);
                    
      if (match) {
        Object.assign(item, {
          img: match.外觀圖檔連結 || match.img || '',
          sh: match.形狀 || match.sh || '',
          cl: match.顏色 || match.cl || '',
          b1: match.標註一 || match.b1 || '',
          b2: match.標註二 || match.b2 || '',
          sz: match.外觀尺寸 || match.sz || ''
        });
        matchCount++;
      }
    }
  });

  if (matchCount > 0) {
    const outputPath = path.join(process.cwd(), 'src/assets/nhi_index.json');
    await writeJsonSegmented(outputPath, nhiDatabase);
    logToFile(`外觀整合完成，強化比對成功配對 ${matchCount} 筆圖片。`);
  } else {
    logToFile('未發現可配對的新外觀資料。');
  }

  return { success: true, count: matchCount };
}

ipcMain.handle('search-nhi-local', async (_, { searchTerm, filters }) => {
  return await searchNhiLocal(searchTerm, filters);
})

async function searchNhiLocal(searchTerm: string, filters?: { name?: boolean, code?: boolean, component?: boolean }) {
  logToFile(`專業多條件搜尋: "${searchTerm}", 過濾器: ${JSON.stringify(filters)}`);
  if (!searchTerm || searchTerm.length < 1) return [];
  
  // 支援多關鍵字搜尋 (以空格分開)
  const terms = searchTerm.toLowerCase().trim().split(/\s+/).filter(t => t.length > 0).map(t => {
    // 單位翻譯：將搜尋詞中的單位也進行歸一化對齊
    if (t === '毫克' || t === '公絲') return 'mg';
    if (t === '毫升') return 'ml';
    return t;
  });
  if (terms.length === 0) return [];
  
  if (nhiDatabase.length === 0) {
    logToFile('警告: 資料庫為空');
    return [];
  }

  // 判斷是否有啟用任何過濾器，若無則預設搜尋全部
  const isAnyFilterEnabled = filters && (filters.name || filters.code || filters.component);

  // 1. 廣泛過濾
  let filtered = nhiDatabase.filter((item: any) => {
    // 必須符合「所有」輸入的關鍵字
    return terms.every(term => {
      if (!isAnyFilterEnabled) {
        const targetStr = `${item.c} ${item.br} ${item.br_en} ${item.ing} ${item.m} ${item.n} ${item.n_cn}`.toLowerCase();
        return targetStr.includes(term);
      } else {
        let match = false;
        if (filters.code && item.c.toLowerCase().includes(term)) match = true;
        if (filters.name && `${item.br} ${item.br_en} ${item.n} ${item.n_cn}`.toLowerCase().includes(term)) match = true;
        if (filters.component && item.ing && item.ing.toLowerCase().includes(term)) match = true;
        return match;
      }
    });
  });

  // 2. 備案：如果全部匹配無結果，嘗試「部分匹配」(OR 邏輯)
  if (filtered.length === 0) {
    filtered = nhiDatabase.filter((item: any) => {
      return terms.some(term => {
        if (!isAnyFilterEnabled) {
          const targetStr = `${item.c} ${item.br} ${item.br_en} ${item.ing} ${item.m} ${item.n} ${item.n_cn}`.toLowerCase();
          return targetStr.includes(term);
        } else {
          let match = false;
          if (filters.code && item.c.toLowerCase().includes(term)) match = true;
          if (filters.name && `${item.br} ${item.br_en} ${item.n} ${item.n_cn}`.toLowerCase().includes(term)) match = true;
          if (filters.component && item.ing && item.ing.toLowerCase().includes(term)) match = true;
          return match;
        }
      });
    }).slice(0, 50); // 避免 OR 搜尋結果過多導致前端卡死
  }

  // 3. 專業權重排序
  const mainTerm = terms[0];
  const sorted = filtered.sort((a: any, b: any) => {
    // A. 健保代碼完全符合優先
    if (a.c.toLowerCase() === mainTerm) return -1;
    if (b.c.toLowerCase() === mainTerm) return 1;
    
    // B. 品名啟始符合優先
    const aStartMatch = (a.br || '').toLowerCase().startsWith(mainTerm) || (a.br_en || '').toLowerCase().startsWith(mainTerm);
    const bStartMatch = (b.br || '').toLowerCase().startsWith(mainTerm) || (b.br_en || '').toLowerCase().startsWith(mainTerm);
    if (aStartMatch && !bStartMatch) return -1;
    if (!aStartMatch && bStartMatch) return 1;

    return 0;
  });

  logToFile(`搜尋完畢，回傳最佳匹配結果: ${sorted.length}`);
  return sorted.slice(0, 150); // 放寬結果筆數至 150
}

// --- HTTP Bridge for Browser Support ---
function startHttpBridge() {
  const PORT = 3010;
  const server = http.createServer(async (req, res) => {
    // Enable CORS for localhost
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const parsedUrl = parseUrl(req.url || '', true);
    let pathname = parsedUrl.pathname || '/';
    
    if (req.method === 'POST' && pathname === '/api/invoke') {
      // ... API handling ...
      let body = '';
      req.on('data', chunk => body += chunk.toString());
      req.on('end', async () => {
        try {
          const { channel, args } = JSON.parse(body);
          console.log(`[Bridge] Invoking ${channel} via HTTP`);
          
          let result;
          if (channel === 'perform-search') {
            result = await performSearch(args[0].searchTerm, args[0].platforms, args[0].filters);
          } else if (channel === 'submit-captcha') {
            const { platformId, code } = args[0];
            const captchaReq = pendingCaptchas.find(r => r.platformId === platformId);
            if (captchaReq && captchaReq.resolve) {
              captchaReq.resolve(code);
              pendingCaptchas = pendingCaptchas.filter(r => r.platformId !== platformId);
              result = { success: true };
            } else {
              result = { success: false, error: 'Captcha request not found' };
            }
          } else if (channel === 'search-nhi-local') {
            result = await searchNhiLocal(args[0]);
          } else if (channel === 'get-drug-appearance') {
            result = await getDrugAppearance(args[0].license, args[0].name, args[0].nhiCode);
          } else if (channel === 'ping') {
            result = 'pong';
          } else if (channel === 'set-automation-mode') {
            automationManager.setHeadless(args[0].headless);
            result = { success: true };
          } else if (channel === 'interrupt-search') {
            isSearchInterrupted = true;
            await automationManager.interruptPages();
            result = { success: true };
          } else if (channel === 'reload-nhi-db') {
            result = await reloadNhiDb();
          } else if (channel === 'integrate-appearance') {
            result = await integrateAppearance();
          } else if (channel === 'auto-index-nhi') {
            // Mocking auto-index for bridge
            const NHI_DIR = path.join(process.cwd(), '健保藥品離線資料庫');
            if (fs.existsSync(NHI_DIR)) {
              const allFiles = fs.readdirSync(NHI_DIR).filter(f => /\.(txt|b5)$/i.test(f)).map(f => path.join(NHI_DIR, f));
              if (allFiles.length > 0) {
                // Since bridge has no 'event' for progress, we call it synchronously
                // (This is a limitation, but it works for now)
                result = await processNhiTxt({ sender: { send: () => {} } }, allFiles);
              } else {
                result = { success: false, error: 'No files found' };
              }
            } else {
              result = { success: false, error: 'Database folder not found' };
            }
          } else {
            result = { error: `Channel ${channel} not supported via bridge` };
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        } catch (err: any) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/captchas') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      // 只回傳需要的資料，過濾掉 resolve 等 function
      const data = pendingCaptchas.map(r => ({
        platformId: r.platformId,
        platformName: r.platformName,
        image: r.image
      }));
      res.end(JSON.stringify(data));
      return;
    }

    // --- Static File Serving ---
    if (req.method === 'GET') {
      if (pathname === '/') pathname = '/index.html';
      const distPath = path.join(process.cwd(), 'dist');
      const filePath = path.join(distPath, pathname);

      // Security check: ensure path is within dist
      if (!filePath.startsWith(distPath)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }

      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(filePath).toLowerCase();
        const mimeTypes: any = {
          '.html': 'text/html',
          '.js': 'text/javascript',
          '.css': 'text/css',
          '.json': 'application/json',
          '.png': 'image/png',
          '.jpg': 'image/jpg',
          '.gif': 'image/gif',
          '.svg': 'image/svg+xml',
          '.wav': 'audio/wav',
          '.mp4': 'video/mp4',
          '.woff': 'application/font-woff',
          '.ttf': 'application/font-ttf',
          '.eot': 'application/vnd.ms-fontobject',
          '.otf': 'application/font-otf',
          '.wasm': 'application/wasm'
        };
        const contentType = mimeTypes[ext] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': contentType });
        fs.createReadStream(filePath).pipe(res);
      } else {
        // SPA Fallback: serve index.html for unknown routes
        const indexPath = path.join(distPath, 'index.html');
        if (fs.existsSync(indexPath)) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          fs.createReadStream(indexPath).pipe(res);
        } else {
          res.writeHead(404);
          res.end('Not Found');
        }
      }
      return;
    }

    res.writeHead(404);
    res.end();
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[Bridge] HTTP Bridge Server running at http://0.0.0.0:${PORT}`);
  });
}
