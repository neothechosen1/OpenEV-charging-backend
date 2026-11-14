/// <reference types="vite/client" />
import {convexTest} from 'convex-test';
import {expect,test} from 'vitest';
import {api} from './_generated/api';
import schema from './schema';
const modules=import.meta.glob('./**/*.ts');
test('business writes add field metadata atomically and exclude customer contents',async()=>{
 const t=convexTest(schema,modules);
 const seeded=await t.mutation(api.setup.seedDemo,{});
 const events=await t.run(ctx=>ctx.db.query('mutationAuditEvents').collect());
 expect(events.length).toBeGreaterThan(3);
 expect(events.some(e=>e.resourceType==='organizations'&&e.changedFields.includes('name'))).toBe(true);
 expect(JSON.stringify(events)).not.toContain('Demo Energía');
 const initial=events.length;
 const property=await t.run(ctx=>ctx.db.query('properties').first());
 await t.mutation(api.properties.setElectricityCost,{propertyId:property!._id,electricityCostPerKwhMinor:999});
 const later=await t.run(ctx=>ctx.db.query('mutationAuditEvents').collect());
 expect(later.length).toBe(initial+1);
 expect(later.at(-1)?.changedFields).toEqual(['electricityCostPerKwhMinor']);
 expect(later.at(-1)?.actorType).toBe('service');
});
