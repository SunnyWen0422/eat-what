import {rename} from 'node:fs/promises';

/** Only the caller's newly-created staging directory is promoted. Windows AV
 * scanners can briefly retain handles after inventory/ZIP reads. Keep the same
 * atomic rename, bound retries to 750ms, and never fall back to overwriting or
 * copying into a partly-visible release directory. Permanent errors propagate.
 */
export async function promoteReleaseDirectory(
 source:string,destination:string,
 move:(source:string,destination:string)=>Promise<void>=rename,
 sleep:(ms:number)=>Promise<void>=ms=>new Promise(resolve=>setTimeout(resolve,ms)),
):Promise<void>{
 const delays=[50,100,200,400];
 for(let attempt=0;;attempt++){
  try{await move(source,destination);return;}
  catch(error){const code=(error as NodeJS.ErrnoException).code;
   if(attempt>=delays.length||!['EPERM','EBUSY'].includes(code??''))throw error;
   await sleep(delays[attempt]!);
  }
 }
}
