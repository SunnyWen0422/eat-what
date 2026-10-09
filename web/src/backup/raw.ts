import type { RawSnapshot } from '../data/repository.ts';
/** Graph representation preserves key types, cycles and shared references without executing stored content. */
type Atom = null|boolean|string|number|{tag:'undefined'}|{tag:'number';value:string}|{tag:'bigint';value:string}|{ref:number};
type Node={kind:string;[key:string]:unknown};
export interface EncodedRawSnapshot {snapshot:{databaseName:string;version:number;stores:{name:string;entries:{key:Atom;value:Atom}[]}[]};nodes:Node[]}
export async function encodeRawSnapshot(raw:RawSnapshot):Promise<EncodedRawSnapshot>{
  const nodes:Node[]=[],seen=new Map<object,number>();
  async function atom(value:unknown):Promise<Atom>{
    if(value===null||typeof value==='string'||typeof value==='boolean')return value;
    if(typeof value==='number')return Number.isFinite(value)&&!Object.is(value,-0)?value:{tag:'number',value:Object.is(value,-0)?'-0':String(value)};
    if(typeof value==='undefined')return {tag:'undefined'};if(typeof value==='bigint')return {tag:'bigint',value:String(value)};
    if(typeof value!=='object')throw new TypeError('Value is not an IndexedDB structured-clone value');
    // Fail before broad supported branches can collapse persisted subtype state.
    if((typeof DOMException!=='undefined'&&value instanceof DOMException)||Object.prototype.toString.call(value)==='[object DOMException]')throw new TypeError('Unsupported DOMException; its host identity cannot be preserved by this raw encoding');
    const resizable=(buffer:ArrayBuffer)=>(buffer as ArrayBuffer&{resizable?:boolean}).resizable===true;
    if(value instanceof ArrayBuffer&&resizable(value)||ArrayBuffer.isView(value)&&value.buffer instanceof ArrayBuffer&&resizable(value.buffer))throw new TypeError('Unsupported resizable ArrayBuffer or backed view; maximum size and length-tracking semantics cannot be preserved by this raw encoding');
    if(seen.has(value))return {ref:seen.get(value)!};const ref=nodes.length;seen.set(value,ref);const node:Node={kind:''};nodes.push(node);
    if(Array.isArray(value)){node.kind='array';node.length=value.length;node.entries=await Promise.all(Object.keys(value).map(async key=>[key,await atom((value as unknown as Record<string,unknown>)[key])]));}
    else if(value instanceof Date){node.kind='date';node.value=Number.isFinite(value.getTime())?value.toISOString():null;}
    else if(value instanceof Map){node.kind='map';node.entries=[];for(const [key,item] of value)(node.entries as unknown[]).push([await atom(key),await atom(item)]);}
    else if(value instanceof Set){node.kind='set';node.entries=[];for(const item of value)(node.entries as unknown[]).push(await atom(item));}
    else if(value instanceof RegExp){node.kind='regexp';node.source=value.source;node.flags=value.flags;node.lastIndex=value.lastIndex;}
    else if(value instanceof ArrayBuffer){node.kind='buffer';node.bytes=Array.from(new Uint8Array(value));}
    else if(ArrayBuffer.isView(value)){node.kind='view';node.type=value.constructor.name;node.buffer=await atom(value.buffer);node.byteOffset=value.byteOffset;node.byteLength=value.byteLength;}
    else if(typeof Blob!=='undefined'&&value instanceof Blob){node.kind=typeof File!=='undefined'&&value instanceof File?'file':'blob';node.type=value.type;node.bytes=Array.from(new Uint8Array(await value.arrayBuffer()));if(node.kind==='file'){node.name=(value as File).name;node.lastModified=(value as File).lastModified;}}
    else if(value instanceof Error){node.kind='error';node.name=value.name;node.message=value.message;node.stack=value.stack??null;if('cause' in value)node.cause=await atom(value.cause);if(value instanceof AggregateError)node.errors=await atom(value.errors);}
    else if(value instanceof Number||value instanceof Boolean||value instanceof String||Object.prototype.toString.call(value)==='[object BigInt]'){node.kind='boxed';node.value=await atom(value.valueOf());}
    else if(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null){node.kind='object';node.nullPrototype=Object.getPrototypeOf(value)===null;node.entries=[];for(const [key,item] of Object.entries(value))(node.entries as unknown[]).push([key,await atom(item)]);}
    else throw new TypeError(`Unsupported stored host object: ${Object.prototype.toString.call(value)} (for example, nonextractable CryptoKey cannot be preserved as JSON)`);
    return {ref};
  }
  const stores:EncodedRawSnapshot['snapshot']['stores']=[];
  for(const store of raw.stores){const entries:EncodedRawSnapshot['snapshot']['stores'][number]['entries']=[];for(const entry of store.entries)entries.push({key:await atom(entry.key),value:await atom(entry.value)});stores.push({name:store.name,entries});}
  return {snapshot:{databaseName:raw.databaseName,version:raw.version,stores},nodes};
}
