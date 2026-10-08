const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
function client() {
  const requests=[], state={id:'A'}
  const module={exports:{}}
  const wx={getStorageSync:key=>key==='userInfo'?{id:state.id}:key==='token'?'token-'+state.id:null,request:request=>requests.push(request),showToast(){}}
  vm.runInNewContext(fs.readFileSync('utils/api.js','utf8'),{module,wx,console:{log(){},warn(){},error(){}},setTimeout,clearTimeout,getApp:()=>({globalData:{}}),require:()=>({getApiBaseUrl:()=>'/api'})})
  return {api:module.exports,requests,state}
}
test('every diet review read has a new transport request so a correction cannot reuse an older read', async () => {
  const {api,requests}=client()
  const old=api.getDietReview('2026-01-01','2026-01-07')
  const fresh=api.getDietReview('2026-01-01','2026-01-07')
  assert.equal(requests.length,2)
  assert.notEqual(requests[0].url,requests[1].url)
  for(const request of requests){const url=new URL(request.url,'https://example.test');assert.equal(url.searchParams.get('startDate'),'2026-01-01');assert.equal(url.searchParams.get('endDate'),'2026-01-07');assert.equal(request.method,'GET')}
  requests[1].success({statusCode:200,data:{mealCount:2}})
  assert.equal((await fresh).mealCount,2)
  requests[0].success({statusCode:200,data:{mealCount:1}})
  assert.equal((await old).mealCount,1)
})
test('report nonce leaves other GET deduplication and account checks intact', async () => {
  const {api,requests,state}=client()
  const first=api.getMealOverview('2026-01-01','2026-01-07')
  const second=api.getMealOverview('2026-01-01','2026-01-07')
  assert.equal(requests.length,1);assert.equal(first,second)
  requests[0].success({statusCode:200,data:{plans:[]}});await first
  const report=api.getDietReview('2026-01-01','2026-01-07')
  state.id='B';requests[1].success({statusCode:200,data:{mealCount:99}})
  await assert.rejects(report,error=>error.isAccountChanged===true)
})
