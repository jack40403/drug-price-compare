const fs = require('fs');
const path = require('path');

const FILES = ['all1_11504_1.TXT', 'all1_11504_2.TXT'];
const PROJECT_ROOT = path.resolve(__dirname, '../../');
const OUTPUT_FILE = path.join(PROJECT_ROOT, 'src/assets/nhi_index.json');
const APPEARANCE_FILE = path.join(PROJECT_ROOT, '藥品外觀/42_5.json');

const FORM_SUFFIXES = ['錠', '膠囊', '軟膠囊', '糖衣錠', '膜衣錠', '點眼液', '凝膠', '乳膏', '噴霧劑', '注射液', '溶液', '軟膏', '緩釋', '長效'];
const UNIT_SUFFIXES = ['毫克', '公絲', '毫升', '微克', '公克', '公分', '個', '支', '貼', '單位', 'MG', 'ML', 'G', 'MCG', 'IU'];
const MANUF_SUFFIXES = ['股份有限公司', '化學', '製藥', '藥廠', '工廠', '廠'];

function cleanBrandCN(name) {
  if (!name) return '';
  let brand = name.split(/[ 　,，(（/]/)[0];
  brand = brand.replace(/[0-9０-９.．]/g, '');
  let changed = true;
  const allSuffixes = [...FORM_SUFFIXES, ...UNIT_SUFFIXES];
  while (changed) {
    changed = false;
    for (const suffix of allSuffixes) {
      if (brand.endsWith(suffix)) {
        brand = brand.substring(0, brand.length - suffix.length);
        changed = true;
      }
    }
  }
  return brand.trim();
}

function cleanManuf(name) {
  if (!name) return '';
  let m = name.trim();
  let changed = true;
  while (changed) {
    changed = false;
    for (const suffix of MANUF_SUFFIXES) {
      if (m.endsWith(suffix)) {
        m = m.substring(0, m.length - suffix.length);
        changed = true;
      }
    }
  }
  return m.trim();
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function run() {
  console.log('🚀 啟動「深度整合」計畫：自動回填授權與外觀資料...');
  
  // 1. 建立外觀查詢 Map (字號 Map & 名稱 Map)
  const apLicMap = new Map();
  const apNameMap = new Map();
  
  if (fs.existsSync(APPEARANCE_FILE)) {
    console.log('📦 正在建立外觀特徵庫...');
    try {
      const rawAppearance = JSON.parse(fs.readFileSync(APPEARANCE_FILE, 'utf8'));
      rawAppearance.forEach(item => {
        const apObj = {
          img: item.外觀圖檔連結 || '',
          sh: item.形狀 || '',
          cl: item.顏色 || '',
          b1: item.標註一 || '',
          b2: item.標註二 || '',
          sz: item.外觀尺寸 || '',
          lic: item.許可證字號 || ''
        };
        
        if (item.許可證字號) apLicMap.set(item.許可證字號.trim(), apObj);
        if (item.中文品名) apNameMap.set(item.中文品名.trim(), apObj);
      });
      console.log(`✅ 外觀特徵庫建立完成：${apLicMap.size} 筆字號，${apNameMap.size} 筆名稱。`);
    } catch (e) {
      console.error('❌ 加載外觀檔案失敗:', e.message);
    }
  }

  const db = new Map();
  let totalProcessed = 0;
  let integratedCount = 0;
  const decoder = new TextDecoder('big5');

  // 2. 處理健保原始檔
  for (const filename of FILES) {
    let filePath = path.join(PROJECT_ROOT, filename);
    if (!fs.existsSync(filePath)) {
      filePath = path.join(PROJECT_ROOT, '健保藥品離線資料庫', filename);
    }
    
    if (!fs.existsSync(filePath)) {
      console.log(`⚠️ 跳過不存在的檔案: ${filename}`);
      continue;
    }

    console.log(`🔍 深度掃描: ${filename}`);
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(64 * 1024);
    let bytesRead;
    let leftover = Buffer.alloc(0);
    const pattern = Buffer.from('              N  ');

    while ((bytesRead = fs.readSync(fd, buffer, 0, buffer.length)) > 0) {
      let combined = Buffer.concat([leftover, buffer.slice(0, bytesRead)]);
      let offset = 0;

      while (true) {
        offset = combined.indexOf(pattern, offset);
        if (offset === -1 || offset + 1843 > combined.length) {
          leftover = offset === -1 ? combined.slice(-2000) : combined.slice(offset);
          break;
        }

        const res = combined.slice(offset, offset + 1843);
        const code = res.slice(17, 27).toString('ascii').trim();
        const priceStr = res.slice(33, 42).toString('ascii').trim();
        const dateEnd = res.slice(46, 53).toString('ascii').trim();
        const rawNameEn = res.slice(54, 230).toString('ascii').trim();
        const rawNameCn = decoder.decode(res.slice(770, 930)).split('\x00')[0].trim();
        const rawManuf = decoder.decode(res.slice(1780, 1843)).split('\x00')[0].trim();
        const license = decoder.decode(res.slice(484, 550)).split('\x00')[0].trim(); 

        if (code.length === 10 && /^[A-Z0-9]+$/.test(code)) {
          const brandCn = cleanBrandCN(rawNameCn);
          const p = parseFloat(priceStr.replace(/,/g, '')) || 0;
          const existing = db.get(code);

          if (p > 0 && (!existing || parseInt(dateEnd) > parseInt(existing.d))) {
            const entry = {
              c: code,
              p: p,
              n: rawNameEn,
              n_cn: rawNameCn,
              br: brandCn,
              br_en: rawNameEn.split(' ')[0],
              ing: rawNameEn.match(/\(([^)]+)\)/)?.[1]?.toUpperCase() || '',
              ds: (rawNameEn.match(/(\d+\.?\d*\s?(MG|ML|%|GM|IU))/i) || [])[0]?.toUpperCase() || '',
              m: cleanManuf(rawManuf),
              d: dateEnd,
              lic: license
            };

            // --- ✨ 智慧整合外觀資料 ---
            let appearance = null;
            // A. 字號精確匹配
            if (license && apLicMap.has(license)) {
              appearance = apLicMap.get(license);
            } 
            // B. 名稱模糊匹配 (如果字號抓不到，且品牌名稱存在)
            if (!appearance && brandCn) {
              // 1. 完全等於品牌名
              if (apNameMap.has(brandCn)) {
                appearance = apNameMap.get(brandCn);
              } else {
                // 2. 局部匹配 (深度搜索)
                for (const [apName, apObj] of apNameMap.entries()) {
                  if (apName.includes(brandCn) || brandCn.includes(apName)) {
                    appearance = apObj;
                    break;
                  }
                }
              }
            }

            if (appearance) {
              if (appearance.img) entry.img = appearance.img;
              if (appearance.sh) entry.sh = appearance.sh;
              if (appearance.cl) entry.cl = appearance.cl;
              if (appearance.b1) entry.b1 = appearance.b1;
              if (appearance.b2) entry.b2 = appearance.b2;
              if (appearance.sz) entry.sz = appearance.sz;
              if (!entry.lic) entry.lic = appearance.lic; // 回填許可證字號
              integratedCount++;
            }

            db.set(code, entry);
          }
        }
        
        offset += 1000;
        totalProcessed++;

        if (totalProcessed % 2000 === 0) {
          process.stdout.write('🧬');
          await sleep(1); 
        }
      }
    }
    fs.closeSync(fd);
  }

  const results = Array.from(db.values());
  console.log(`\n🏆 整合完成！`);
  console.log(`- 總藥品數：${results.length}`);
  console.log(`- 成功綁定外觀：${integratedCount} 筆藥物`);
  
  const dir = path.dirname(OUTPUT_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results));
  console.log('💾 資料庫已重新建構成功。');
}

run().catch(console.error);
