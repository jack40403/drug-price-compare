const fs = require('fs');
const iconv = require('iconv-lite');
const path = require('path');

async function debugFile() {
    const dir = 'C:/drug-price-compare/';
    const files = fs.readdirSync(dir, { recursive: true });
    const targetFile = files.find(f => f.includes('all1_11504_1.TXT') || f.includes('all1_11504_2.TXT'));
    
    if (!targetFile) {
        console.log('Target TXT file not found.');
        return;
    }

    const filePath = path.join(dir, targetFile);
    console.log('Analyzing:', filePath);
    
    const buffer = fs.readFileSync(filePath);
    
    // 搜尋關鍵字：脂瑞妥 (Crestor) 或其代碼 BC24151
    const searchTerm = iconv.encode('脂瑞妥', 'big5');
    const searchCode = Buffer.from('BC24151', 'ascii');
    
    let index = buffer.indexOf(searchTerm);
    if (index === -1) {
        index = buffer.indexOf(searchCode);
    }
    
    if (index !== -1) {
        console.log(`Found target at byte offset ${index}`);
        
        // 找到該行的起始 (往前找換行符 0x0A 或 0x0D)
        let startOfLine = index;
        while (startOfLine > 0 && buffer[startOfLine - 1] !== 0x0A) {
            startOfLine--;
        }
        
        // 取得該行完整 Buffer (限制 2000 bytes 避免過長)
        let endOfLine = index;
        while (endOfLine < buffer.length && buffer[endOfLine] !== 0x0A) {
            endOfLine++;
        }
        
        const lineBuffer = buffer.slice(startOfLine, endOfLine);
        console.log(`Line Byte Length: ${lineBuffer.length}`);
        
        // 每 10 個 byte 標記一次，方便觀察位置
        console.log('--- Offset Map ---');
        let header = '';
        for (let i = 0; i < 100; i += 10) header += i.toString().padEnd(10);
        console.log(header);
        
        // 顯示解碼後的字串
        const decoded = iconv.decode(lineBuffer, 'cp950');
        console.log('Decoded Content:', decoded);
        
        // 輸出代碼在該 Buffer 中的實際偏移量
        const codePos = lineBuffer.indexOf(searchCode);
        console.log(`NHI Code Position in line buffer: ${codePos}`);
        
        // 輸出中文字在該 Buffer 中的實際偏移量 (Byte offset)
        const namePos = lineBuffer.indexOf(searchTerm);
        console.log(`Chinese Name Position in line buffer: ${namePos}`);
        
    } else {
        console.log('Target NOT FOUND in the file.');
    }
}

debugFile().catch(console.error);
