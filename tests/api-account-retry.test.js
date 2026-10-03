const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm')
test('a delayed shopping write retry cannot use the next account token',async()=>{
 let account='A',resume;const headers=[];const ctx={module:{exports:{}},console:{log(){},warn(){},error(){}},setTimeout:cb=>{resume=cb},clearTimeout(){},require:()=>({getApiBaseUrl:()=>'/api'}),wx:{getStorageSync:key=>key==='userInfo'?{id:account}:key==='token'?'token-'+account:null,showToast(){},request:options=>{headers.push(options.header.Authorization);options.fail({errMsg:'network'})}}}
 vm.runInNewContext(fs.readFileSync('utils/api.js','utf8'),ctx);const writing=ctx.module.exports.clearShoppingList({requestId:'clear-A',expectedListVersion:0,scope:'all'});await new Promise(resolve=>setImmediate(resolve));account='B';resume();await assert.rejects(writing);assert.deepEqual(headers,['Bearer token-A'])
})
