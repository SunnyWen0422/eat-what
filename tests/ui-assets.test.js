const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const root=path.resolve(__dirname,'..');
test('native icon component loads only JavaScript modules',()=>{
 const vm=require('node:vm');let component;
 vm.runInNewContext(fs.readFileSync(path.join(root,'components/ui-icon/ui-icon.js'),'utf8'),{
  require(id){assert.ok(!id.endsWith('.json'),'native require cannot load JSON as a JS module');return require(path.resolve(root,'components/ui-icon',id))},
  Component(value){component=value}
 });
 const page={setData(value){this.data=value}};component.properties.name.observer.call(page,'chef');assert.equal(page.data.asset,'cooking-pot');
 assert.deepEqual(require('../utils/ui-assets').icons,require('../design/asset-manifest.json').icons);
});
test('IDE scan excludes legacy test temporary directories',()=>{
 const ignores=require('../project.config.json').packOptions.ignore;
 assert.ok(ignores.some(x=>x.type==='regexp' && new RegExp(x.value).test('tmppytest-eatwhat-full-40368')));
});
test('single token source has readable brand and text contrasts',()=>{
 const t=require('../design/tokens.json');
 function lum(h){const v=h.replace('#','').match(/../g).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return v[0]*.2126+v[1]*.7152+v[2]*.0722}
 function ratio(a,b){const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)}
 assert.ok(ratio(t.colors.brand,t.colors.card)>=4.5);assert.ok(ratio(t.colors.muted,t.colors.background)>=4.5);assert.equal(t.controls.primaryHeight,48);assert.equal(t.controls.touchSize,44)
 assert.equal(require('../utils/ui-tokens').brand,t.colors.brand)
})
test('runtime PNG assets are included in the mini program package',()=>{
 const config=require('../project.config.json')
 for(const ignore of config.packOptions.ignore) assert.ok(!(ignore.type==='suffix' && ignore.value==='.png'),'PNG assets must not be globally excluded')
})
test('formal asset manifest covers the complete icon set, tab variants and five illustrations',()=>{
 const m=require('../design/asset-manifest.json');assert.equal(m.icons.length,37);assert.equal(m.illustrations.length,5)
 for(const n of [...m.icons,...m.tabs.map(n=>n+'-selected')]) for(const ext of ['svg','png']) assert.ok(fs.statSync(path.join(root,'assets/icons',n+'.'+ext)).size>100)
 for(const n of m.illustrations) for(const ext of ['svg','png']) assert.ok(fs.statSync(path.join(root,'assets/illustrations',n+'.'+ext)).size>100)
})
