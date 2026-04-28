const fs = require('fs');
const path = require('path');

function fullToHalf(s) {
  if (!s) return '';
  return s.toString().replace(/[\uFF01-\uFF5E]/g, function(ch) {
    return String.fromCharCode(ch.charCodeAt(0) - 0xFEE0);
  }).replace(/\u3000/g, ' ');
}

function normalize(s) {
  if (!s) return '';
  // 1. 轉半形並轉小寫
  let text = fullToHalf(s).toLowerCase();
  // 2. 處理健保檔特有的尾隨格式 (切割掉空格或逗號後的部分)
  text = text.split(/[\s,，]/)[0];
  // 3. 去除標點與常用單位對其
  return text.replace(/[()（）\[\]]/g, '')
             .replace(/[""〝〞]/g, '')
             .replace(/毫克|公絲|毫升/g, 'mg')
             .replace(/微克/g, 'mcg')
             .trim();
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

async function runMerge() {
  const nhiPath = path.join(__dirname, '../src/assets/nhi_index.json');
  const appearancePath = path.join(__dirname, '../藥品外觀/42_5.json');

  console.log('Loading databases...');
  const nhiData = JSON.parse(fs.readFileSync(nhiPath, 'utf8'));
  const appearanceData = JSON.parse(fs.readFileSync(appearancePath, 'utf8'));

  const apMap = new Map();
  appearanceData.forEach(ap => {
    const norm = normalize(ap.中文品名);
    if (norm && !apMap.has(norm)) {
      apMap.set(norm, ap);
    }
    // 同時保留原始字元匹配
    if (ap.許可證字號) apMap.set(ap.許可證字號.trim(), ap);
  });

  let matchCount = 0;
  nhiData.forEach(item => {
    // 試圖進行多層次匹配
    const norm = normalize(item.n_cn);
    const match = (item.lic && apMap.has(item.lic)) ? apMap.get(item.lic) : apMap.get(norm);

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
  });

  console.log(`Successfully matched ${matchCount} records with enhanced normalization.`);
  await writeJsonSegmented(nhiPath, nhiData);
  console.log('Merge completed successfully.');
}

runMerge().catch(console.error);
