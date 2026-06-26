import { chromium } from '@playwright/test';

const urls = [
  'http://127.0.0.1:3000/',
  'http://127.0.0.1:3000/?animSmoke=1',
  'https://127.0.0.1:3000/',
  'https://127.0.0.1:3000/?animSmoke=1',
  'http://10.0.0.32:3000/',
  'http://10.0.0.32:3000/?animSmoke=1',
  'https://10.0.0.32:3000/',
  'https://10.0.0.32:3000/?animSmoke=1',
];

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ ignoreHTTPSErrors: true });

for (const url of urls) {
  const page = await ctx.newPage();
  try {
    const r = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    const finalUrl = page.url();
    const hasSmoke = await page.evaluate(() => !!window.__csAnimSmoke);
    console.log(`${url}`);
    console.log(`  status=${r?.status?.() ?? '?'} final=${finalUrl} animSmoke=${hasSmoke}`);
  } catch (e) {
    console.log(`${url} -> FAIL ${e.message.split('\n')[0]}`);
  }
  await page.close();
}

await browser.close();
