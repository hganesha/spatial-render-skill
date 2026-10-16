// browser.mjs — shared headless browser launcher for capture/export/diff CLIs.
// Tries Puppeteer (its cache, then installed Chrome on macOS), then Playwright.
import {existsSync} from 'node:fs';

const ARGS = ['--no-sandbox', '--disable-gpu-sandbox', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'];

// fn(page) runs with a page at `url`, the engine booted (window.sceneEngine).
// page exposes: evaluate(fnOrString, arg), screenshot({path}), pdf(opts), setContent(html), raw.
export async function withScenePage(url, options, fn) {
  const failures = [];
  const explicit = options.browserPath || process.env.PUPPETEER_EXECUTABLE_PATH;
  const candidates = [explicit];
  if (!explicit && process.platform === 'darwin' && existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')) candidates.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
  for (const executablePath of candidates) {
    let browser;
    try {
      const puppeteer = (await import(process.env.PUPPETEER_MODULE || 'puppeteer')).default;
      browser = await puppeteer.launch({headless: true, args: ARGS, ...(executablePath ? {executablePath} : {})});
      const page = await browser.newPage();
      await page.setViewport({width: options.width || 1440, height: options.height || 900, deviceScaleFactor: options.scale || 1});
      return await run(page, url, options, fn, 'puppeteer');
    } catch (error) {failures.push(`Puppeteer${executablePath ? ' (' + executablePath + ')' : ''}: ${error.message}`);}
    finally {await browser?.close();}
  }
  let browser;
  try {
    const playwright = await import('playwright');
    browser = await playwright.chromium.launch({args: ARGS});
    const page = await browser.newPage({viewport: {width: options.width || 1440, height: options.height || 900}, deviceScaleFactor: options.scale || 1});
    return await run(page, url, options, fn, 'playwright');
  } catch (error) {failures.push('Playwright: ' + error.message);}
  finally {await browser?.close();}
  const error = new Error('No headless browser available. Install puppeteer or playwright, or pass --browser-path.\n' + failures.join('\n'));
  error.code = 'NO_BROWSER';
  throw error;
}

async function run(page, url, options, fn, driver) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.stack || error.message));
  await page.goto(url, {waitUntil: 'load', timeout: 60000});
  await page.waitForFunction(() => window.sceneEngine || document.querySelector('.sd-boot-error'));
  const bootError = await page.evaluate(() => document.querySelector('.sd-boot-error')?.textContent || null);
  if (bootError) throw new Error(bootError);
  if (options.wait) await new Promise(resolve => setTimeout(resolve, options.wait));
  const result = await fn(page, driver);
  if (errors.length) throw new Error('Browser exceptions:\n' + errors.join('\n'));
  return result;
}

export function writeDataUrl(fs, file, dataUrl) {
  fs.writeFileSync(file, Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64'));
}
