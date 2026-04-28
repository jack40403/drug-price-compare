const fs = require('fs');
const iconv = require('iconv-lite');
const path = require('path');

async function find() {
    // 尋找檔案
    const dir = 'C:/drug-price-compare/';
    const files = fs.readdirSync(dir, { recursive: true });
    const targetFile = files.find(f => f.includes('all1_11504_2.TXT'));
    
    if (!targetFile) {
        console.log('File not found');
        return;
    }

    const filePath = path.join(dir, targetFile);
    console.log('Reading file:', filePath);
    
    const buffer = fs.readFileSync(filePath);
    const text = iconv.decode(buffer, 'big5');
    
    const searchTerm = '可得安穩';
    const index = text.indexOf(searchTerm);
    
    if (index !== -1) {
        console.log(`Found "${searchTerm}" at char index ${index}`);
        
        // 往前找換行符號以確定行起始
        const startOfLine = text.lastIndexOf('\n', index) + 1;
        const endOfLine = text.indexOf('\n', index);
        const lineContent = text.substring(startOfLine, endOfLine);
        
        console.log('Line length:', lineContent.length);
        console.log('Line preview (first 100 chars):', lineContent.substring(0, 100));
        
        // 抓取健保代碼 (代碼通常在前面)
        console.log('Possible NHI Code in this line:', lineContent.match(/[A-Z][0-9]{9}/)?.[0]);
    } else {
        console.log('Search term NOT FOUND even with iconv-lite');
        
        // 試試英文
        const indexEn = text.toLowerCase().indexOf('diovan');
        if (indexEn !== -1) {
            console.log(`Found "diovan" at char index ${indexEn}`);
        }
    }
}

find().catch(console.error);
