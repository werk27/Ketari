const fs = require('fs');
const path = require('path');

function collectKeys(obj, prefix = '') {
  const keys = [];
  for (const k of Object.keys(obj)) {
    const val = obj[k];
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof val === 'string') {
      keys.push(key);
    } else if (typeof val === 'object' && val !== null) {
      keys.push(...collectKeys(val, key));
    }
  }
  return keys;
}

const enPath = path.join(__dirname, 'i18n_en_temp.json');
const amPath = path.join(__dirname, '..', 'src', 'i18n', 'am.json');

// Build english translations by importing the module (i18n/index.js)
const i18nIndex = path.join(__dirname, '..', 'src', 'i18n', 'index.js');
let enTranslations = {};
try {
  const content = fs.readFileSync(i18nIndex, 'utf8');
  const match = content.match(/const enTranslations = \{([\s\S]*?)\};/m);
  if (match) {
    const objText = `{${match[1]}}`;
    // Quick-and-dirty eval in Node sandbox
    enTranslations = eval(`(${objText})`);
  }
} catch (err) {
  console.error('Failed to read english translations:', err.message);
  process.exit(1);
}

let amTranslations = {};
try {
  amTranslations = JSON.parse(fs.readFileSync(amPath, 'utf8'));
} catch (err) {
  console.error('Failed to read Amharic translations:', err.message);
  process.exit(1);
}

const enKeys = collectKeys(enTranslations).sort();
const amKeys = collectKeys(amTranslations).sort();

const missingInAm = enKeys.filter(k => !amKeys.includes(k));
const extraInAm = amKeys.filter(k => !enKeys.includes(k));

console.log('English keys count:', enKeys.length);
console.log('Amharic keys count:', amKeys.length);
console.log('Missing in Amharic (present in English):', missingInAm.length);
missingInAm.forEach(k => console.log('  -', k));
console.log('\nExtra in Amharic (not in English):', extraInAm.length);
extraInAm.forEach(k => console.log('  -', k));
