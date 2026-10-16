#!/usr/bin/env node
// Capture WebGL + SVG + UI. A broken browser cache falls back to installed Chrome.
import {existsSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
const argv=process.argv.slice(2),options={width:1440,height:900,wait:4500};
const flags={'-o':'out','--width':'width','--height':'height','--wait':'wait','--browser-path':'browserPath'};
for(let i=0;i<argv.length;i++) {
  if(flags[argv[i]]) {const key=flags[argv[i]],value=argv[++i];options[key]=['width','height','wait'].includes(key)?Number(value):value;}
  else if(!argv[i].startsWith('-') && !options.input) options.input=argv[i];
  else throw new Error('Unknown capture argument: '+argv[i]);
}
if(!options.input || !existsSync(resolve(options.input)) || ![options.width,options.height].every(n=>Number.isFinite(n)&&n>0) || !Number.isFinite(options.wait) || options.wait<0) {
  console.error('Usage: node scripts/capture-scene.mjs index.html [-o capture.png] [--wait 4500] [--browser-path /path/to/chrome]');process.exit(2);
}
options.out=resolve(options.out || options.input.replace(/\.html?$/,'')+'.png');mkdirSync(dirname(options.out),{recursive:true});
const url=pathToFileURL(resolve(options.input)).href;
const args=['--no-sandbox','--disable-gpu-sandbox','--enable-webgl','--ignore-gpu-blocklist','--enable-unsafe-swiftshader','--use-angle=swiftshader'];
const failures=[];
async function capturePuppeteer(executablePath) {
  let browser;
  try {
    const puppeteer=(await import(process.env.PUPPETEER_MODULE || 'puppeteer')).default;
    browser=await puppeteer.launch({headless:true,args,...(executablePath?{executablePath}:{})});
    const page=await browser.newPage();await page.setViewport({width:options.width,height:options.height,deviceScaleFactor:2});
    const errors=[];page.on('pageerror',error=>errors.push(error.stack || error.message));
    await page.goto(url,{waitUntil:'load',timeout:60000});
    await page.waitForFunction(()=>window.sceneEngine || document.querySelector('.sd-boot-error'));
    await new Promise(r=>setTimeout(r,options.wait));
    const bootError=await page.$eval('body',body=>body.querySelector('.sd-boot-error')?.textContent);
    if(bootError || errors.length) throw new Error(bootError || errors.join('\n'));
    await page.screenshot({path:options.out});return true;
  } catch(error) {failures.push(`Puppeteer${executablePath?' ('+executablePath+')':''}: ${error.message}`);return false;}
  finally {await browser?.close();}
}
async function capturePlaywright() {
  let browser;
  try {
    const playwright=await import('playwright');browser=await playwright.chromium.launch({args});
    const page=await browser.newPage({viewport:{width:options.width,height:options.height},deviceScaleFactor:2});
    const errors=[];page.on('pageerror',error=>errors.push(error.stack || error.message));
    await page.goto(url,{waitUntil:'load',timeout:60000});
    await page.waitForFunction(()=>window.sceneEngine || document.querySelector('.sd-boot-error'));
    await page.waitForTimeout(options.wait);
    const bootError=await page.locator('.sd-boot-error').allTextContents();
    if(bootError.length || errors.length) throw new Error([...bootError,...errors].join('\n'));
    await page.screenshot({path:options.out});return true;
  } catch(error) {failures.push('Playwright: '+error.message);return false;}
  finally {await browser?.close();}
}
const explicitPath=options.browserPath || process.env.PUPPETEER_EXECUTABLE_PATH;
let captured=await capturePuppeteer(explicitPath);
if(!captured && !explicitPath && process.platform==='darwin') {
  const installed='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  if(existsSync(installed)) captured=await capturePuppeteer(installed);
}
if(!captured) captured=await capturePlaywright();
if(captured) console.log('✓ captured complete diagram: '+options.out);
else {console.error('Capture failed. Install puppeteer/playwright, or pass --browser-path.\n'+failures.join('\n'));process.exitCode=3;}
