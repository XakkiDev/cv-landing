import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const output = path.resolve('test-results');
const root = path.resolve('dist');
await mkdir(output, { recursive: true });
const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.svg':'image/svg+xml', '.webp':'image/webp', '.ttf':'font/ttf' };
const server = createServer(async (req, res) => {
  const name = new URL(req.url, 'http://localhost').pathname;
  const file = path.resolve(root, '.' + (name === '/' ? '/index.html' : name));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  try { const data=await readFile(file); res.writeHead(200, { 'content-type':mime[path.extname(file)] || 'application/octet-stream' }); res.end(data); }
  catch { res.writeHead(404).end('Not found'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}/`;
const log = [], stateKey = 'sluzhilaya-gramota:scroll:main:v1';
let browser, context, page, failure;
try {
  browser = await chromium.launch({ headless:true, args:['--use-gl=angle','--use-angle=swiftshader-webgl','--enable-unsafe-swiftshader'] });
  context = await browser.newContext({ viewport:{width:1365,height:900}, deviceScaleFactor:1, recordVideo:{dir:output, size:{width:1365,height:900}} });
  page = await context.newPage();
  page.on('console', message => log.push({type:'console', level:message.type(), text:message.text()}));
  page.on('pageerror', error => log.push({type:'pageerror', text:error.stack || error.message}));
  page.on('requestfailed', request => log.push({type:'requestfailed', url:request.url(), failure:request.failure()}));
  const gpu = await page.evaluate(() => {
    const gl=document.createElement('canvas').getContext('webgl2');
    if(!gl) return { webgl2:false };
    const debug=gl.getExtension('WEBGL_debug_renderer_info');
    return {webgl2:true, version:gl.getParameter(gl.VERSION), renderer:debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), maxTextureSize:gl.getParameter(gl.MAX_TEXTURE_SIZE)};
  });
  log.push({type:'webgl', ...gpu});
  assert.ok(gpu.webgl2, 'WebGL2 context could not be created; screenshots of the fallback are not a successful 3D test');
  await page.goto(url, {waitUntil:'domcontentloaded'});
  const initial = await page.evaluate(() => ({loading:document.documentElement.classList.contains('scroll-loading'), siteVisible:getComputedStyle(document.querySelector('.site')).visibility}));
  if(initial.loading) assert.equal(initial.siteVisible, 'hidden', 'Document must stay hidden while the 3D scene loads');
  await page.waitForFunction(() => document.documentElement.classList.contains('has-scroll-3d') || document.documentElement.classList.contains('has-scroll-simulation'), null, {timeout:60000});
  await page.screenshot({path:path.join(output,'01-closed.png')});
  assert.ok(await page.locator('html.has-scroll-3d').count(), '3D scene did not initialize; see captured console errors');
  await page.getByRole('button',{name:'Развернуть служилую грамоту'}).click();
  await page.waitForTimeout(220); await page.screenshot({path:path.join(output,'02-opening.png')});
  await page.waitForTimeout(400); await page.screenshot({path:path.join(output,'03-opening.png')});
  await page.waitForTimeout(1200); await page.screenshot({path:path.join(output,'04-open.png')});
  const angles = page.locator('.rotation-values');
  const beforeAngles = await angles.textContent();
  assert.match(beforeAngles, /X:\s*8\.0°.*Y:\s*8\.0°.*Z:\s*0\.0°/, 'Default orientation must match the requested angles');
  await page.mouse.move(680, 450); await page.mouse.down({button:'right'});
  await page.mouse.move(760, 490, {steps:8}); await page.mouse.up({button:'right'});
  const afterAngles = await angles.textContent();
  assert.notEqual(afterAngles, beforeAngles, 'Right-button drag must change reported angles');
  await page.getByRole('button',{name:'Повернуть по часовой стрелке'}).click();
  assert.notEqual(await angles.textContent(), afterAngles, 'Z rotation control must update the reported angles');
  await page.getByRole('button',{name:'Сбросить'}).click();
  assert.equal(await angles.textContent(), beforeAngles, 'Reset must restore the requested orientation');
  await page.screenshot({path:path.join(output,'04b-rotated.png')});
  let saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)),stateKey);
  assert.equal(saved?.open, true, 'Opening must save open state');
  const sheet = page.locator('canvas.scroll-webgl');
  const beforeRolls = await sheet.evaluate(el => ({upper:Number(el.dataset.upperRoll),lower:Number(el.dataset.lowerRoll)}));
  await page.mouse.move(680, 450); await page.mouse.wheel(0, 700); await page.waitForTimeout(500);
  const afterRolls = await sheet.evaluate(el => ({upper:Number(el.dataset.upperRoll),lower:Number(el.dataset.lowerRoll)}));
  assert.ok(afterRolls.upper > beforeRolls.upper, 'The upper roll must grow when scrolling down');
  assert.ok(afterRolls.lower < beforeRolls.lower, 'The lower roll must unwind when scrolling down');
  await page.screenshot({path:path.join(output,'05-scrolled.png')});
  saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)),stateKey);
  assert.ok(saved.offset > 0, 'Scrolling must update saved offset');
  await page.reload({waitUntil:'load'});
  await page.waitForSelector('html.has-scroll-3d', {timeout:60000}); await page.waitForTimeout(600);
  saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)),stateKey);
  assert.equal(saved.open, false, 'Reload must return to folded state');
  assert.equal(saved.offset, 0, 'Reload must reset scroll offset');
  assert.equal(await page.locator('.rotation-panel').isVisible(), false, 'Rotation controls must be hidden while folded');
  await page.screenshot({path:path.join(output,'06-reloaded-closed.png')});
  await page.getByRole('button',{name:'Развернуть служилую грамоту'}).click();
  await page.waitForTimeout(1800);
  await page.getByRole('button',{name:'Свернуть грамоту'}).click();
  await page.waitForTimeout(3000); await page.screenshot({path:path.join(output,'07-closed.png')});
  saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)),stateKey);
  assert.equal(saved.open, false, 'Closing must save closed state');
  const errors = log.filter(entry => entry.type === 'pageerror' || entry.level === 'error');
  assert.deepEqual(errors, [], 'Unexpected JavaScript errors; see diagnostics.json');
  console.log('WebGL scroll check passed:', JSON.stringify(gpu));
} catch (error) {
  failure=error; log.push({type:'test-failure', text:error.stack || error.message});
  if(page) await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});
  console.error(error);
} finally {
  await context?.close().catch(()=>{}); await browser?.close().catch(()=>{});
  await writeFile(path.join(output,'diagnostics.json'), JSON.stringify(log,null,2));
  await new Promise(resolve => server.close(resolve));
}
if(failure) process.exitCode=1;
