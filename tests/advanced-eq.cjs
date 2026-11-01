const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('assert/strict'),fs=require('fs'),path=require('path');
const {pathToFileURL}=require('url');
(async()=>{const browser=await chromium.launch({executablePath:process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});try{
 const p=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);await p.evaluate(()=>localStorage.clear());await p.reload();
 await p.locator('#eq-open').click();await p.locator('#eq-advanced-open').click({timeout:2000});
 for(const n of [10,20,31,64]){await p.locator('#advanced-eq-mode').selectOption(String(n));assert.equal(await p.locator('#advanced-bands [data-graphic]').count(),n);await p.locator('#advanced-bands [data-graphic]').first().fill(String(Math.round(n/10*2)/2));}
 await p.locator('#advanced-eq-mode').selectOption('20');assert.equal(await p.locator('#advanced-bands [data-graphic]').first().inputValue(),'2');
 const flat=await p.locator('#advanced-eq-response').getAttribute('d');await p.locator('#advanced-bands [data-graphic]').nth(8).fill('9');assert.notEqual(await p.locator('#advanced-eq-response').getAttribute('d'),flat);
 await p.locator('#advanced-undo').click();assert.equal(await p.locator('#advanced-bands [data-graphic]').nth(8).inputValue(),'0');
 await p.locator('#advanced-eq-mode').selectOption('parametric');for(let i=0;i<32;i++)await p.locator('#advanced-add-filter').click();assert.equal(await p.locator('[data-filter-row]').count(),32);assert.equal(await p.locator('#advanced-add-filter').isDisabled(),true);
 const freq=p.locator('[data-filter-row] [data-field=frequency]').first();await freq.fill('999999');await freq.blur();assert.equal(await freq.getAttribute('aria-invalid'),'true');assert.match(await p.locator('#advanced-eq-feedback').innerText(),/frequência/i);
 await freq.fill('500');await freq.blur();assert.equal(await freq.getAttribute('aria-invalid'),'false');await p.locator('[data-filter-row] [data-field=gain]').first().fill('6');await p.locator('[data-filter-row] [data-field=gain]').first().blur();
 await p.locator('#advanced-preset-name').fill('Minha referência');await p.locator('#advanced-preset-save').click();assert.match(await p.locator('#advanced-preset').innerText(),/Minha referência/);
 await p.reload();await p.locator('#eq-open').click();await p.locator('#eq-advanced-open').click();assert.equal(await p.locator('#advanced-eq-mode').inputValue(),'parametric');assert.equal(await p.locator('[data-filter-row]').count(),32);assert.equal(await p.locator('[data-filter-row] [data-field=gain]').first().inputValue(),'6');
 await p.setViewportSize({width:390,height:844});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await p.screenshot({path:path.resolve(__dirname,'../previews/test-vynamp-eq-avancado-mobile.png')});
 assert.deepEqual(errors,[]);fs.writeFileSync(path.resolve(__dirname,'../../advanced-eq-validation.json'),JSON.stringify({success:true,counts:[10,20,31,64],independentState:true,mathematicalCurve:true,undo:true,parametric32:true,invalidFrequency:true,presets:true,persistence:true,mobile:true,browserErrors:errors},null,2));console.log('PASS advanced EQ');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
