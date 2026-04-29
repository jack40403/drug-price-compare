/**
 * 好鄰居頁面選擇器診斷腳本
 *
 * 用途：找出 prod / otcProd 頁面上真實的 input 選擇器
 * 執行：node scratch/inspect_yeschain.js
 *
 * 流程：
 * 1. 開啟瀏覽器，前往登入頁
 * 2. 等你手動輸入帳密 + 驗證碼並登入
 * 3. 自動掃描 prod 和 otcProd 頁面的所有 input
 * 4. 印出結果
 */

const { chromium } = require('playwright')

;(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 50 })
  const page = await browser.newPage()

  console.log('=== 好鄰居選擇器診斷工具 ===\n')
  console.log('步驟 1：前往登入頁，請手動輸入帳密 + 驗證碼...')

  await page.goto('https://www.yeschain.com.tw/b2bStoreCart/login', {
    waitUntil: 'domcontentloaded',
  })

  // 等待登出登入頁（最多等 5 分鐘）
  console.log('等待你登入完成（最多 5 分鐘）...')
  await page.waitForFunction(
    () => !window.location.href.includes('b2bStoreCart/login'),
    { timeout: 300000 }
  )

  console.log(`\n✅ 偵測到登入成功！當前 URL: ${page.url()}`)
  await page.waitForTimeout(1500)

  // 掃描兩個目標頁面
  for (const targetUrl of [
    'https://www.yeschain.com.tw/b2bStoreCart/prod',
    'https://www.yeschain.com.tw/b2bStoreCart/otcProd',
  ]) {
    console.log(`\n${'='.repeat(60)}`)
    console.log(`掃描頁面：${targetUrl}`)
    console.log('='.repeat(60))

    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000) // 等 SPA 渲染

    const inputs = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('input, textarea, select'))
        .map((el) => {
          const rect = el.getBoundingClientRect()
          const visible = rect.width > 0 && rect.height > 0 && el.offsetParent !== null
          return {
            tag: el.tagName.toLowerCase(),
            type: el.getAttribute('type') || '(無)',
            id: el.id || '(無)',
            name: el.getAttribute('name') || '(無)',
            placeholder: el.getAttribute('placeholder') || '(無)',
            class: el.className || '(無)',
            visible,
          }
        })
        .filter((el) => el.type !== 'hidden')
    })

    if (inputs.length === 0) {
      console.log('⚠️  找不到任何 input 元素（頁面可能未完全載入或被重新導向）')
      console.log(`當前 URL：${page.url()}`)
    } else {
      console.log(`找到 ${inputs.length} 個輸入元素：\n`)
      inputs.forEach((el, i) => {
        const visibleMark = el.visible ? '👁  可見' : '👻 隱藏'
        console.log(`[${i + 1}] ${visibleMark}`)
        console.log(`     tag:         ${el.tag}`)
        console.log(`     type:        ${el.type}`)
        console.log(`     id:          ${el.id}`)
        console.log(`     name:        ${el.name}`)
        console.log(`     placeholder: ${el.placeholder}`)
        console.log(`     class:       ${el.class}`)
        console.log()
      })
    }
  }

  console.log('\n=== 診斷完成，請把上面的輸出貼給 Claude ===')
  console.log('按 Ctrl+C 或關閉瀏覽器視窗結束。')
  await page.waitForTimeout(99999999) // 保持瀏覽器開著讓你看
})()
