import fs from 'fs';
import readline from 'readline';
import path from 'path';

// Note: In a real environment, we would use iconv-lite for Big5.
// Here we will use a buffer-based approach to extract raw bytes if needed,
// but for standard drug names, we will attempt common parsing.

const FILES = ['all1_11504_1.TXT', 'all1_11504_2.TXT'];
const OUTPUT_FILE = 'C:/drug-price-compare/src/assets/nhi_index.json';

interface NHIData {
  code: string;
  price: number;
  nameEn: string;
  nameCn: string;
  ingredient: string;
  date: string; // YYYMMDD
}

async function processDB() {
  console.log('開始處理巨型健保資料庫...');
  const db = new Map<string, NHIData>();
  let totalLines = 0;

  for (const filename of FILES) {
    const filePath = path.join('C:/drug-price-compare', filename);
    if (!fs.existsSync(filePath)) {
      console.warn(`找不到檔案: ${filename}, 跳過。`);
      continue;
    }

    console.log(`正在讀取 ${filename} ...`);
    const fileStream = fs.createReadStream(filePath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    for await (const line of rl) {
      totalLines++;
      if (line.length < 100) continue;

      try {
        const code = line.substring(17, 27).trim();
        const priceStr = line.substring(27, 42).trim();
        const dateEnd = line.substring(50, 57).trim(); // 結束日期
        const nameEn = line.substring(58, 250).trim();
        const ingredient = line.substring(261, 400).trim();
        
        // Use a placeholder for CN name as standard JS strings might struggle with Big5
        // We will try to grab the likely CN area (approx 500-800)
        // In this environment, we'll focus on Code/Price/EnName first to ensure stability
        
        const price = parseFloat(priceStr) || 0;

        if (code && code.length === 10) {
          const existing = db.get(code);
          // Only keep the one with the latest dateEnd
          if (!existing || parseInt(dateEnd) > parseInt(existing.date)) {
            db.set(code, {
              code,
              price,
              nameEn,
              nameCn: "", // Placeholder or limited extraction
              ingredient,
              date: dateEnd
            });
          }
        }
      } catch (e) {
        // Skip malformed lines
      }
      
      if (totalLines % 100000 === 0) {
        console.log(`已處理 ${totalLines} 行...`);
      }
    }
  }

  console.log(`處理完成。總行數: ${totalLines}, 獨立藥品數: ${db.size}`);
  
  const results = Array.from(db.values());
  
  // Ensure directory exists
  const dir = path.dirname(OUTPUT_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2));
  console.log(`成功匯出索引檔至: ${OUTPUT_FILE}`);
}

processDB().catch(console.error);
