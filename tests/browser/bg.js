const { chromium } = require('/opt/node-tools/node_modules/playwright');
(async()=>{const b=await chromium.launch();const ext=new Set();
for (const scheme of ['light','dark']) {
 const c=await b.newContext({viewport:{width:1100,height:760},colorScheme:scheme});const p=await c.newPage();
 p.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:8766/')&&!r.url().startsWith('data:'))ext.add(r.url())});
 p.on('requestfailed',r=>console.log('FAILED',r.url()));
 await p.goto('http://127.0.0.1:8766/#/reading/r-pandas/1');await p.waitForSelector('h1');await p.waitForTimeout(300);
 await p.screenshot({path:process.argv[2]+'/bg-'+scheme+'.png'});
 if(scheme==='light'){await p.goto('http://127.0.0.1:8766/#/');await p.waitForSelector('.stops');await p.screenshot({path:process.argv[2]+'/bg-home.png'});}
}
console.log('external:',ext.size?[...ext]:'none');await b.close()})()
