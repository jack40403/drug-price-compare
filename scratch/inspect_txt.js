const fs = require('fs');
const iconv = require('iconv-lite');
const path = require('path');

const filePath = '健保藥品離線資料庫/all1_11504_1.TXT';
if (!fs.existsSync(filePath)) {
    console.log('File not found');
    process.exit(1);
}

const buffer = Buffer.alloc(2000);
const fd = fs.openSync(filePath, 'r');
fs.readSync(fd, buffer, 0, 2000, 0);
fs.closeSync(fd);

console.log('--- INDEXED DECODED (50 chars per block) ---');
for (let i = 0; i < 2000; i += 100) {
    const block = buffer.slice(i, i + 100);
    console.log(`[${i.toString().padStart(4, '0')}] ${iconv.decode(block, 'big5')}`);
}
