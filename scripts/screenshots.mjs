#!/usr/bin/env node
// Capture the hero shot of the app feed in both themes.
//
// The landing page swaps its phone screenshot with the theme, so the two
// captures have to be the same frame in two palettes -- shooting one by hand
// and the other months later is how they drift apart. Serves the repo over
// loopback (file:// would break the absolute /theme.js and /tokens.css paths),
// loads app.html with the theme pre-seeded into localStorage, and shoots the
// seed feed so the result does not depend on what is in the database today.
//
// Playwright is not a dependency of the site -- nothing here has a build step
// (CLAUDE.md) -- so install it only when regenerating:
//
//   npm i --no-save playwright && node scripts/screenshots.mjs
//
// Chromium comes from Playwright's own download, or from
// CHROMIUM_EXECUTABLE_PATH when pointing at a browser already on the machine.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(ROOT, 'screenshots');
const VIEWPORT = { width: 390, height: 844 };   // iPhone 15 logical pixels
const SCALE = 3;                                 // ...at 3x, matching the device
const TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png'
};

function serve() {
    const server = createServer(async (req, res) => {
        const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
        const rel = normalize(path === '/' ? '/index.html' : path).replace(/^(\.\.[/\\])+/, '');
        try {
            const body = await readFile(join(ROOT, rel));
            res.writeHead(200, { 'Content-Type': TYPES[extname(rel)] || 'application/octet-stream' });
            res.end(body);
        } catch {
            res.writeHead(404).end('not found');
        }
    });
    return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

async function shoot(browser, origin, theme) {
    const context = await browser.newContext({
        viewport: VIEWPORT,
        deviceScaleFactor: SCALE,
        isMobile: true,
        hasTouch: true,
        colorScheme: theme
    });
    // Seeded before any page script runs, so the very first paint is the right
    // theme -- otherwise the capture can catch the default-dark flash.
    await context.addInitScript(t => localStorage.setItem('spark_theme', t), theme);

    const page = await context.newPage();
    // No API server here, so /api/posts fails and app.html falls back to its
    // built-in seed ideas. That is the point: a stable, reproducible feed.
    await page.goto(`${origin}/app.html`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => {
        const feed = document.getElementById('feed');
        return feed && !feed.textContent.includes('Loading') && feed.children.length > 0;
    }, null, { timeout: 15000 });
    await page.waitForTimeout(400);   // let the card fade-up animation settle

    const file = join(OUT, `spark-feed-${theme}.png`);
    await page.screenshot({ path: file });
    await context.close();
    console.log(`  ${file.replace(ROOT, '')} (${VIEWPORT.width}x${VIEWPORT.height} @${SCALE}x)`);
}

const { chromium } = await import('playwright');
const server = await serve();
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch(
    process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : {}
);
try {
    console.log('capturing feed screenshots:');
    for (const theme of ['dark', 'light']) await shoot(browser, origin, theme);
} finally {
    await browser.close();
    server.close();
}
