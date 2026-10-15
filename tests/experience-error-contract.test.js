const test=require('node:test'),assert=require('node:assert/strict')
const {errorMessage}=require('../utils/meal-workflow')
test('technical failures use local actionable copy while conflict remains distinct',()=>{
 for(const message of ['SELECT secret FROM users','C:/private/token','供应商 HTTP 500','<script>','java.lang.RuntimeException'])
  assert.equal(errorMessage({statusCode:500,data:{message}},'暂未读到，请重试'),'暂未读到，请重试')
 assert.equal(errorMessage({statusCode:409,message:'HTTP 409'}),'内容已更新，请重新读取后确认修改')
 assert.equal(errorMessage({statusCode:503,data:{message:'服务正忙，请稍后再试'}}),'服务正忙，请稍后再试')
})
test('unknown write state copy never instructs creating a fresh request',()=>{
 const fallback='结果待确认，请核对原请求'
 assert.equal(errorMessage({statusCode:0,message:'request:fail timeout'},fallback),fallback)
})
