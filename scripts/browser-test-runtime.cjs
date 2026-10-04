const fs = require('node:fs'), path = require('node:path');
let playwright;
try { playwright = require('playwright'); }
catch { playwright = require(path.join(process.env.EREAD_RUNTIME_MODULES || 'C:/Users/benbe/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules', 'playwright')); }
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
module.exports = { chromium: playwright.chromium, browserOptions: { headless: true, ...(process.env.SKIPREADER_BROWSER ? { executablePath: process.env.SKIPREADER_BROWSER } : process.platform === 'win32' && fs.existsSync(edge) ? { executablePath: edge } : {}) } };
