import {mutation as rawMutation,internalMutation as rawInternalMutation,type MutationCtx} from './_generated/server';
import schema from './schema';
import {convexToJson} from 'convex/values';

type Identity={actor:string;actorUserId?:string;actorType:string;actorBasis:string};
const tables=Object.keys(schema.tables).filter(t=>!['mutationAuditEvents','auditEvents','auditLog','auditLogs','audit'].includes(t));
async function identity(ctx:MutationCtx,args:Record<string,unknown>):Promise<Identity>{
 try { const id=await ctx.auth.getUserIdentity();if(id)return {actor:id.tokenIdentifier,actorUserId:id.tokenIdentifier,actorType:'human',actorBasis:'verified identity token'}; } catch { /* Existing business authorization remains authoritative. */ }
 return {actor:'service-or-unattributed',actorType:'service',actorBasis:'entrypoint only; actual operator unavailable'};
}
const encoded=(value:any)=>value===undefined?'undefined':JSON.stringify(convexToJson(value));
function fields(value:Record<string,unknown>,before?:Record<string,unknown>,replace=false){
 const keys=[...new Set([...Object.keys(value),...(replace?Object.keys(before??{}):[])])].filter(k=>!k.startsWith('_')&&(!before||encoded(value[k])!==encoded(before[k])));
 const sensitive=/password|secret|token|credential|hash|salt|cookie|authorization/i;
 const safe=keys.filter(k=>!sensitive.test(k));if(keys.some(k=>sensitive.test(k)))safe.push('restricted_fields');return safe.sort();
}
function wrap(ctx:MutationCtx,actor:Identity,operation:string):MutationCtx{
 const original=ctx.db;
 const tableFor=(id:string)=>tables.find(t=>original.normalizeId(t as never,id));
 async function record(table:string,id:string,action:string,changedFields:string[],data?:Record<string,unknown>){
  if(!changedFields.length)return;
  const tenant=data?.organizationId??data?.tenantId??data?.facilityId??data?.projectSlug??data?.tenantSlug;
  await original.insert('mutationAuditEvents',{...actor,action:operation+'.'+action,resourceType:table,resourceId:id,changedFields,createdAt:Date.now(),...(typeof tenant==='string'?{tenantRef:tenant}:{})});
 }
 const db=new Proxy(original,{get(target,property){
  if(property==='insert')return async(table:string,data:Record<string,unknown>)=>{const id=await target.insert(table as never,data as never);if(tables.includes(table))await record(table,id,'insert',fields(data),data);return id;};
  if(property==='patch'||property==='replace')return async(...args:any[])=>{const named=args.length===3;const id=args[named?1:0] as string;const data=args[named?2:1] as Record<string,unknown>;const table=named?String(args[0]):tableFor(id);const before=table?await (target.get as any).apply(target,named?[table,id]:[id]):null;await (target[property] as any).apply(target,args);if(table&&tables.includes(table))await record(table,id,String(property),fields(data,before??undefined,property==='replace'),before??data);};
  if(property==='delete')return async(...args:any[])=>{const named=args.length===2;const id=args[named?1:0] as string;const table=named?String(args[0]):tableFor(id);const before=table?await (target.get as any).apply(target,args):null;await (target.delete as any).apply(target,args);if(table&&tables.includes(table))await record(table,id,'delete',['record'],before??undefined);};
  const value=Reflect.get(target,property);return typeof value==='function'?value.bind(target):value;
 }} ) as MutationCtx['db'];return {...ctx,db};
}
type Definition={args:Record<string,unknown>;handler:(ctx:MutationCtx,args:Record<string,unknown>)=>unknown};
export function auditedMutation(operation:string):typeof rawMutation{
 const register=rawMutation as unknown as(definition:Definition)=>unknown;
 return ((d:Definition)=>register({...d,handler:async(ctx,args)=>d.handler(wrap(ctx,await identity(ctx,args),operation),args)})) as unknown as typeof rawMutation;
}
export function auditedInternalMutation(operation:string):typeof rawInternalMutation{
 const register=rawInternalMutation as unknown as(definition:Definition)=>unknown;
 return ((d:Definition)=>register({...d,handler:async(ctx,args)=>d.handler(wrap(ctx,await identity(ctx,args),operation),args)})) as unknown as typeof rawInternalMutation;
}
