const fs = require('fs');

function fullToHalf(s) {
    return s.replace(/[\uFF01-\uFF5E]/g, function(ch) {
        return String.fromCharCode(ch.charCodeAt(0) - 0xFEE0);
    }).replace(/\u3000/g, ' ');
}

function normalize(s) {
    if (!s) return '';
    let text = fullToHalf(s.toString().toLowerCase());
    // Remove dose info at the end of the name part
    // NHI names often look like: "福元"納舒糖衣錠100毫克 CHLORPROMAZINE...
    // We only want the first part before any space or specific delimiters
    text = text.split(/[\s,，]/)[0];
    
    return text.replace(/[()（）\[\]]/g, '')
               .replace(/[""〝〞]/g, '')
               .replace(/毫克|公絲|毫升/g, 'mg')
               .replace(/微克/g, 'mcg')
               .trim();
}

const nhiPath = 'src/assets/nhi_index.json';
const appearancePath = '藥品外觀/42_5.json';

const nhiData = JSON.parse(fs.readFileSync(nhiPath, 'utf8'));
const appearanceData = JSON.parse(fs.readFileSync(appearancePath, 'utf8'));

const apMap = new Map();
appearanceData.forEach(ap => {
    const norm = normalize(ap.中文品名);
    if (norm) {
        if (!apMap.has(norm)) apMap.set(norm, ap);
    }
});

let matches = 0;
const matchedExamples = [];
const unmatchedExamples = [];

nhiData.forEach(item => {
    const norm = normalize(item.n_cn);
    if (apMap.has(norm)) {
        matches++;
        if (matchedExamples.length < 5) matchedExamples.push({ orig: item.n_cn, norm: norm, match: apMap.get(norm).中文品名 });
    } else {
        if (unmatchedExamples.length < 10) unmatchedExamples.push({ orig: item.n_cn, norm: norm });
    }
});

console.log(`Matched with improved normalization: ${matches}`);
console.log('--- Examples of MATCHED ---');
matchedExamples.forEach(e => console.log(`NHI: ${e.orig}\n  -> NORM: ${e.norm}\n  -> AP: ${e.match}`));

console.log('--- Examples of UNMATCHED ---');
unmatchedExamples.forEach(e => console.log(`NHI: ${e.orig}\n  -> NORM: ${e.norm}`));
