// Read real local public responses through the mini-program presentation modules.
// No media downloads, account credentials, external services or writes.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const canonical = require('../utils/canonical-recipe')
const {presentRecipeIngredients} = require('../utils/recipe-display')
const {createCatalogCache} = require('../utils/catalog-cache')

async function main() {
  const [url,output] = process.argv.slice(2), base = new URL(url)
  assert.equal(base.protocol,'http:');assert.equal(base.hostname,'127.0.0.1')
  assert.equal(base.pathname,'/api');assert.ok(base.port && !base.username && !base.search && !base.hash)
  const memory = new Map(), app={globalData:{}}
  const cache = createCatalogCache({wx:{getStorageSync:key=>memory.get(key),setStorageSync:(key,value)=>memory.set(key,value)},appProvider:()=>app,getApiBaseUrl:()=>url})
  const rows=[];let expected=null, complete=0, partial=0
  for(let page=1;page<=5;page++) {
    const response=await fetch(url+'/public/catalog/dishes?page='+page+'&pageSize=100',{redirect:'error',signal:AbortSignal.timeout(30000)})
    assert.equal(response.status,200)
    const data=await response.json()
    if(expected===null)expected=data.total
    assert.ok(Number.isInteger(expected)&&expected>0&&expected<=500)
    assert.equal(data.total,expected)
    for(const dish of data.list) {
      canonical.recipeOf(dish);canonical.fixedCalculation(dish.scaledRecipe)
      const display=presentRecipeIngredients(dish)
      assert.equal(display.basis,'整道菜用量')
      assert.equal(display.rows.length,dish.recipe.ingredients.filter(line=>line.defaultEnabled).length)
      assert.equal(canonical.stepLines(dish,dish.scaledRecipe).length,dish.recipe.steps.length)
      const nutrition=canonical.nutritionView(dish.scaledRecipe)
      assert.equal(nutrition.nutritionAvailable,dish.scaledRecipe.nutrition.completeness==='complete')
      nutrition.nutritionAvailable ? complete++ : partial++
      rows.push(dish)
    }
    if(rows.length===expected)break
  }
  assert.equal(rows.length,expected);assert.equal(new Set(rows.map(row=>row.id)).size,expected)
  cache.write(rows);app.globalData.allDishes=null
  assert.equal(cache.read().length,expected)
  const result={passed:true,publicRecipes:expected,nutritionComplete:complete,nutritionPartial:partial,realHttpToMiniPresentation:true,persistentFixedPolicyCache:true,nativeDeviceVerified:false}
  if(output)fs.writeFileSync(output,JSON.stringify(result,null,2),{flag:'wx'})
  console.log(JSON.stringify(result))
}
main().catch(error=>{console.error(error);process.exitCode=1})
