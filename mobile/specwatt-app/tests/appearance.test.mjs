import test from 'node:test';
import assert from 'node:assert/strict';
test('appearance persistence rejects executable SVG, external resources and traversal',async()=>{
 const {validateAppearance}=await import('../src/specwatt/appearance-policy.ts');
 assert.equal(validateAppearance({kind:'svg',xml:'<svg onload="alert(1)"/>'}),null);
 assert.equal(validateAppearance({kind:'photo',uri:'https://example.com/private.jpg'}),null);
 assert.equal(validateAppearance({kind:'photo',uri:'file:///data/specwatt-photos/../secret.jpg'}),null);
 const v={kind:'vector',config:{categoryId:'mushroom-lamp',color:'cream',variant:'rounded',details:'detailed'}};
 assert.deepEqual(validateAppearance(v),v);
 assert.equal(validateAppearance({...v,script:'evil'}),null);
});
