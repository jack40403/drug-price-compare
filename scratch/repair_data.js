const fs = require('fs');
const path = require('path');

function cleanClinicalString(s) {
  if (!s) return '';
  // 1. 移除控制字元與亂碼
  let text = s.replace(/[\x00-\x1F\x7F]/g, '');
  text = text.replace(/\uFFFD/g, ''); 
  text = text.replace(/\?/g, '');
  return text.trim();
}

/**
 * 嚴格提取：只保留英文字母、數字與基本標點，徹底排除中文字元
 */
function extractEnglishOnly(s) {
  if (!s) return '';
  // 移除所有中文字元 (Range: \u4e00-\u9fa5)
  let text = s.replace(/[\u4e00-\u9fa5]+/g, '');
  // 移除 Big5 轉碼失敗產生的殘留問號或特殊符號
  text = text.replace(/[^\x20-\x7E]+/g, '');
  // 去除頭尾逗號與多餘空白
  text = text.trim().replace(/^,+|,+$/g, '').trim();
  
  // 如果提取後只剩下數字或太短，說明無效
  if (text.length < 2 || /^[0-9\s.,]+$/.test(text)) return '';
  
  return text;
}

function extractIngredientAggressive(n_cn) {
  if (!n_cn) return '';
  
  // 分隔邏輯：通常是 品名 [空格] 成分 [逗號] 其他
  const commaParts = n_cn.split(',');
  for (const part of commaParts) {
    const englishOnly = extractEnglishOnly(part);
    if (englishOnly && /[A-Z]{2,}/.test(englishOnly)) {
      return englishOnly;
    }
  }

  // 正則備案
  const regex = /([A-Z0-9]{3,}[\s,.\-A-Z0-9]*)$/;
  const match = n_cn.match(regex);
  if (match) {
    return extractEnglishOnly(match[1]);
  }

  return '';
}

async function writeJsonSegmented(filePath, data) {
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

async function repair() {
  const filePath = path.join(__dirname, '../src/assets/nhi_index.json');
  console.log('Loading database for ENGLISH-ONLY repair...');
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  
  console.log(`Analyzing ${data.length} records...`);
  let updatedCount = 0;
  
  data.forEach(item => {
    // 1. 強制清理原有 ing 中的中文字
    if (item.ing) {
      const original = item.ing;
      item.ing = extractEnglishOnly(item.ing);
      if (item.ing !== original) updatedCount++;
    }

    // 2. 如果清理後變空，重新從品名抓
    if (!item.ing || item.ing.trim() === '') {
      const extracted = extractIngredientAggressive(item.n_cn);
      if (extracted && extracted.length > 2) {
          item.ing = extracted;
          updatedCount++;
      }
    }
  });
  
  console.log(`Cleaned and extracted ${updatedCount} ingredient fields (English Only).`);
  await writeJsonSegmented(filePath, data);
  console.log('English-Only Database repair completed.');
}

repair().catch(console.error);
