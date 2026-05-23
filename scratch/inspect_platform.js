/**
 * 全平台 DOM 結構診斷工具 (Universal Platform Inspector)
 *
 * 用途：檢查各比價平台的登入頁與搜尋結果頁 DOM 欄位，協助確認或更新 connector 的 CSS 選取器
 *
 * 執行方式：
 *   node scratch/inspect_platform.js [平台ID]
 *
 * 平台ID 清單：
 *   binli     彬利        https://www.twbingli.com/index.php
 *   chahwa    嘉鏵        https://www.chahwa.com.tw/user.php
 *   jhaohong  兆宇(兆宏)  https://www.jhao-hong.com.tw/
 *   yeschain  好鄰居(躍獅) https://www.yeschain.com.tw/b2bStoreCart/login
 *   yusheng   宇盛        https://www.yusheng0307.com/
 *   coda      可達藥品    https://www.codadrug.com.tw/
 *   mdt       蔓達特      https://www.mdtky.com.tw/Member/login
 *   yc        益全生技    https://ycmedicine.com.tw/sign/in/in.html
 *   taichung  泰昌藥品    https://taichung-pc.com.tw/index.php
 *
 * 範例：
 *   node scratch/inspect_platform.js chahwa
 *   node scratch/inspect_platform.js   (不填則顯示選單)
 */

const { chromium } = require('playwright')

// ── 平台設定 ─────────────────────────────────────────────────────
const PLATFORMS = {
  binli: {
    name: '彬利',
    loginUrl: 'https://www.twbingli.com/index.php',
    searchUrl: 'https://www.twbingli.com/order.php',
    loginDoneCheck: () => !window.location.href.includes('index.php') || document.querySelector('a.sign-first[title="會員登入"]') === null,
  },
  chahwa: {
    name: '嘉鏵',
    loginUrl: 'https://www.chahwa.com.tw/user.php',
    searchUrl: 'https://www.chahwa.com.tw/order.php',
    loginDoneCheck: () => !!document.querySelector('a:not([style*="none"]):not([hidden])') && window.location.href.includes('chahwa'),
  },
  jhaohong: {
    name: '兆宇 (兆宏)',
    loginUrl: 'https://www.jhao-hong.com.tw/',
    searchUrl: 'https://www.jhao-hong.com.tw/prdindex.php',
    loginDoneCheck: () => window.location.href.includes('prdindex') || !!document.querySelector('button#logout, a:not([href*="login"])'),
  },
  yeschain: {
    name: '好鄰居 (躍獅)',
    loginUrl: 'https://www.yeschain.com.tw/b2bStoreCart/login',
    searchUrl: 'https://www.yeschain.com.tw/b2bStoreCart/prod',
    loginDoneCheck: () => !window.location.href.includes('b2bStoreCart/login'),
  },
  yusheng: {
    name: '宇盛',
    loginUrl: 'https://www.yusheng0307.com/',
    searchUrl: 'https://www.yusheng0307.com/product.html',
    loginDoneCheck: () => document.body.innerText.includes('會員登出'),
  },
  coda: {
    name: '可達藥品',
    loginUrl: 'https://www.codadrug.com.tw/',
    searchUrl: 'https://www.codadrug.com.tw/Product/Product',
    loginDoneCheck: () => window.location.href.includes('/Home/Index') || window.location.href.includes('/Product/'),
  },
  mdt: {
    name: '蔓達特',
    loginUrl: 'https://www.mdtky.com.tw/Member/login',
    searchUrl: 'https://www.mdtky.com.tw/Shop/Product/index',
    loginDoneCheck: () => window.location.href.includes('Shop/') || window.location.href.includes('Product/Search'),
  },
  yc: {
    name: '益全生技',
    loginUrl: 'https://ycmedicine.com.tw/sign/in/in.html',
    searchUrl: 'https://ycmedicine.com.tw/product/all/index.html',
    loginDoneCheck: () => !window.location.href.includes('/sign/in/'),
  },
  taichung: {
    name: '泰昌藥品',
    loginUrl: 'https://taichung-pc.com.tw/index.php',
    searchUrl: 'https://taichung-pc.com.tw/order.php?act=order',
    loginDoneCheck: () => document.querySelector('a.signin.gosign') === null,
  },
}

// ── 工具函式 ─────────────────────────────────────────────────────
function sep(title = '') {
  const line = '='.repeat(60)
  if (title) console.log(`\n${line}\n  ${title}\n${line}`)
  else console.log(line)
}

async function scanInputs(page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('input, textarea, select'))
      .filter(el => el.getAttribute('type') !== 'hidden')
      .map(el => {
        const rect = el.getBoundingClientRect()
        return {
          tag: el.tagName.toLowerCase(),
          type: el.getAttribute('type') || '(none)',
          id: el.id || '-',
          name: el.getAttribute('name') || '-',
          placeholder: el.getAttribute('placeholder') || '-',
          class: el.className.substring(0, 60) || '-',
          visible: rect.width > 0 && rect.height > 0 && el.offsetParent !== null,
        }
      })
  )
}

async function scanProductElements(page) {
  return page.evaluate(() => {
    const results = {}

    // 常見的產品容器選取器
    const containerSelectors = [
      'li.item', '.item', '.pdConList', '.productBox', '.pdList li',
      'a.item', '.thumbnail', '.product_info_div', 'li.d-lg-block',
      'tr', 'tbody tr',
    ]

    for (const sel of containerSelectors) {
      const els = document.querySelectorAll(sel)
      if (els.length > 0) {
        results[sel] = els.length
      }
    }

    // 常見的欄位選取器
    const fieldSelectors = [
      // 品名
      'h3', '.name', '.product-name', '.fw-bolder', '.drug-name',
      // 健保碼
      '.nhi-code', '.nhi', 'a.text-info', '.code', '.code.above',
      // 價格
      '.price', '.p', '.product_item_price', 'span.fs-5',
      // 庫存
      '.stock', '.s', '.product_item_stock', '.text-outofstock',
      // 效期
      '.lifetime', '.validity', '.product_valid_date', '.expiry',
      // 健保價
      '.nhi-price', '.red',
    ]

    for (const sel of fieldSelectors) {
      const el = document.querySelector(sel)
      if (el) {
        results[`[FIELD] ${sel}`] = el.innerText.substring(0, 80).trim()
      }
    }

    return results
  })
}

// ── 主流程 ─────────────────────────────────────────────────────
;(async () => {
  const platformId = process.argv[2]?.toLowerCase()

  if (!platformId || !PLATFORMS[platformId]) {
    console.log('\n╔══════════════════════════════════════════════════════════╗')
    console.log('║           全平台 DOM 診斷工具  v2.0                      ║')
    console.log('╚══════════════════════════════════════════════════════════╝')
    console.log('\n使用方式：  node scratch/inspect_platform.js [平台ID]\n')
    console.log('可用平台：')
    for (const [id, p] of Object.entries(PLATFORMS)) {
      console.log(`  ${id.padEnd(12)} ${p.name}`)
    }
    if (platformId) {
      console.log(`\n❌ 找不到平台 ID：${platformId}`)
    }
    process.exit(0)
  }

  const platform = PLATFORMS[platformId]
  const browser = await chromium.launch({ headless: false, slowMo: 50, devtools: false })
  const page = await browser.newPage()

  sep(`平台：${platform.name}  (${platformId})`)

  // ── STEP 1：登入頁面掃描 ──────────────────────────────────────
  console.log(`\n[1/3] 前往登入頁：${platform.loginUrl}`)
  await page.goto(platform.loginUrl, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)

  console.log('\n📋 登入頁 Input 欄位：')
  const loginInputs = await scanInputs(page)
  loginInputs.forEach((el, i) => {
    const vis = el.visible ? '👁 可見' : '👻 隱藏'
    console.log(`  [${i + 1}] ${vis} | tag=${el.tag} type=${el.type} id=${el.id} name=${el.name} placeholder=${el.placeholder}`)
    console.log(`       class="${el.class}"`)
  })

  // ── STEP 2：等待手動登入 ─────────────────────────────────────
  console.log('\n⚠️  請在瀏覽器視窗手動輸入帳密並完成登入（最多 5 分鐘）...')
  try {
    await page.waitForFunction(platform.loginDoneCheck, { timeout: 300000 })
    console.log(`\n✅ 偵測到登入完成！URL: ${page.url()}`)
  } catch (e) {
    console.log('\n⚠️  等待超時，繼續嘗試掃描搜尋頁...')
  }
  await page.waitForTimeout(1500)

  // ── STEP 3：搜尋頁面掃描 ─────────────────────────────────────
  console.log(`\n[2/3] 跳轉至搜尋頁：${platform.searchUrl}`)
  await page.goto(platform.searchUrl, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2000)

  console.log('\n📋 搜尋頁 Input 欄位：')
  const searchInputs = await scanInputs(page)
  if (searchInputs.length === 0) {
    console.log('  ⚠️  未找到任何 Input（頁面可能未完全載入）')
  } else {
    searchInputs.forEach((el, i) => {
      const vis = el.visible ? '👁 可見' : '👻 隱藏'
      console.log(`  [${i + 1}] ${vis} | tag=${el.tag} type=${el.type} id=${el.id} name=${el.name} placeholder=${el.placeholder}`)
      console.log(`       class="${el.class}"`)
    })
  }

  // ── STEP 4：請手動搜尋一個藥品，然後按 Enter 繼續 ──────────
  console.log('\n⚠️  請在搜尋頁輸入任一藥品名稱並按搜尋，等結果出現後...')
  console.log('   按 Enter 繼續掃描結果頁的 DOM 結構')
  await new Promise(resolve => process.stdin.once('data', resolve))

  // ── STEP 5：結果頁面 DOM 掃描 ─────────────────────────────────
  console.log(`\n[3/3] 掃描搜尋結果 DOM（URL: ${page.url()}）`)
  await page.waitForTimeout(1000)

  const elements = await scanProductElements(page)
  console.log('\n📦 偵測到的產品容器與欄位：')
  for (const [sel, val] of Object.entries(elements)) {
    if (sel.startsWith('[FIELD]')) {
      console.log(`  ${sel.padEnd(35)} → "${val}"`)
    } else {
      console.log(`  找到 ${String(val).padStart(4)} 個元素  ←  ${sel}`)
    }
  }

  // ── STEP 6：抓取前 3 筆原始 innerText ────────────────────────
  console.log('\n📄 前 3 筆產品卡片原始文字 (innerText):')
  const rawTexts = await page.evaluate(() => {
    const selectors = ['li.item', '.item', '.pdConList', '.productBox', 'li.d-lg-block', '.product_info_div', 'tbody tr']
    for (const sel of selectors) {
      const els = document.querySelectorAll(sel)
      if (els.length > 0) {
        return Array.from(els).slice(0, 3).map((el, i) => ({
          index: i + 1,
          selector: sel,
          text: el.innerText.substring(0, 300)
        }))
      }
    }
    return []
  })

  if (rawTexts.length === 0) {
    console.log('  ⚠️  找不到產品卡片，可能需要手動確認選取器')
  } else {
    rawTexts.forEach(({ index, selector, text }) => {
      console.log(`\n  [第 ${index} 筆] 選取器: ${selector}`)
      console.log('  ' + text.replace(/\n/g, '\n  '))
    })
  }

  sep('診斷完成')
  console.log('請把上面的輸出貼給 Claude 進行選取器更新。')
  console.log('按 Ctrl+C 關閉視窗。\n')
  await page.waitForTimeout(99999999)
})()
