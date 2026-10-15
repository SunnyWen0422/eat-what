import {describe,it,expect} from 'vitest';
import {promoteReleaseDirectory} from '../scripts/promote-release.ts';
describe('owned release promotion',()=>{
 it('recovers a transient Windows scanner lock with a finite retry and no copy fallback',async()=>{
  let calls=0;const waits:number[]=[];
  await promoteReleaseDirectory('new.staging','new',async()=>{if(++calls<3)throw Object.assign(Error('locked'),{code:'EPERM'});},async ms=>{waits.push(ms);});
  expect(calls).toBe(3);expect(waits).toEqual([50,100]);
 });
 it('preserves a permanent failure after the bounded deadline',async()=>{
  let calls=0;const failure=Object.assign(Error('persistent lock'),{code:'EBUSY'});
  await expect(promoteReleaseDirectory('new.staging','new',async()=>{calls++;throw failure;},async()=>{})).rejects.toBe(failure);
  expect(calls).toBe(5);
 });
 it('does not retry unrelated or destination-exists errors',async()=>{
  for(const code of ['EACCES','EEXIST','ENOTEMPTY','ENOENT']){let calls=0;await expect(promoteReleaseDirectory('new.staging','new',async()=>{calls++;throw Object.assign(Error('rejected'),{code});},async()=>{})).rejects.toHaveProperty('code',code);expect(calls).toBe(1);}
 });
});
