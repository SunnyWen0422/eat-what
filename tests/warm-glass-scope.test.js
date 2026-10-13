const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs')
test('dish purchasing preview and personal dish groups have a glass backdrop rather than white on white',()=>{
 assert.match(fs.readFileSync('pages/shopping-preview/shopping-preview.wxml','utf8'),/class="preview-dish-surface"/)
 assert.match(fs.readFileSync('design/wxss/pages/shopping-preview/shopping-preview.tpl','utf8'),/\.preview-dish-surface\s*\{[^}]*linear-gradient/)
 assert.match(fs.readFileSync('web/src/ui/My.tsx','utf8'),/className="card personal-dishes"/)
 assert.match(fs.readFileSync('web/src/ui/styles.css','utf8'),/\.personal-dishes\s*\{[^}]*linear-gradient/)
})
test('assistant buttons explicitly override native default widths instead of squeezing the input and dish name',()=>{
 assert.match(fs.readFileSync('design/wxss/pages/chat/chat.tpl','utf8'),/\.connected-input-row \.connected-voice\s*\{[^}]*width:auto[^}]*min-width:48px/)
 assert.match(fs.readFileSync('design/wxss/pages/chat/chat.tpl','utf8'),/\.connected-input-row \.connected-send\s*\{[^}]*width:auto/)
 assert.match(fs.readFileSync('design/wxss/components/assistant-card/index.tpl','utf8'),/\.assistant-card \.card-dish\s*\{[^}]*width:100%/)
})
