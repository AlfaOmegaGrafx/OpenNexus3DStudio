#!/usr/bin/env node
import { chromium } from '@playwright/test';

const baseUrl = (process.argv[2] || 'http://127.0.0.1:3000').replace(/\/$/, '');
const path = process.argv[3] || '/studio';
const url = `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;

const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext()).newPage();
const pageErrors = [];
const consoleErrors = [];

page.on('pageerror', (err) => pageErrors.push(String(err?.message || err)));
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});

const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
console.log('HTTP', resp?.status() ?? 'unknown');
await page.waitForTimeout(4000);
console.log('title', await page.title());
const flowNodes = await page.locator('.react-flow__node').count();
const flowHost = await page.locator('.studio-graph-host').count();
console.log('reactFlowNodes', flowNodes, 'graphHost', flowHost);
console.log('bodyText', (await page.locator('body').innerText()).slice(0, 400));
console.log('pageErrors', JSON.stringify(pageErrors, null, 2));
console.log('consoleErrors', JSON.stringify(consoleErrors.slice(0, 10), null, 2));
await browser.close();

if (pageErrors.length) process.exit(1);
