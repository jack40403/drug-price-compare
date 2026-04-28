const fs = require('fs');
const path = require('path');

function normalize(s) {
  if (!s) return '';
  return s.toString().toLowerCase()
    .replace(/[()（）\[\]]/g, '')
    .replace(/[""]/g, '')
    .replace(/\s+/g, '')
    .replace(/[0-9]+(\.[0-9]+)?\s*(mg|ml|g|gm|iu|%)/gi, '') // Remove dosage
    .trim();
}

const nhiPath = 'src/assets/nhi_index.json';
const appearancePath = '藥品外觀/42_5.json';

const nhiData = JSON.parse(fs.readFileSync(nhiPath, 'utf8'));
const appearanceData = JSON.parse(fs.readFileSync(appearancePath, 'utf8'));

const apMap = new Map();
appearanceData.forEach(ap => {
    const norm = normalize(ap.中文品名);
    if (norm) apMap.set(norm, ap);
});

let matches = 0;
const samples = [];

nhiData.forEach(item => {
    const norm = normalize(item.n_cn);
    if (apMap.has(norm)) {
        matches++;
    } else if (samples.length < 20) {
        samples.push({ nhi: item.n_cn, norm: norm });
    }
});

console.log(`Potential matches with normalization: ${matches}`);
console.log('--- Samples of UNMATCHED (Normalized) ---');
samples.forEach(s => console.log(`NHI: ${s.nhi} -> NORM: ${s.norm}`));

const apSamples = appearanceData.slice(0, 5).map(ap => ({ orig: ap.中文品名, norm: normalize(ap.中文品名) }));
console.log('--- Samples of APPEARANCE (Normalized) ---');
apSamples.forEach(s => console.log(`AP: ${s.orig} -> NORM: ${s.norm}`));
