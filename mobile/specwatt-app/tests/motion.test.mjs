import test from 'node:test';
import assert from 'node:assert/strict';
test('motion honors reduced movement and rejects invalid numeric display values',async()=>{
 const {motion,motionDuration,normalizedPower}=await import('../src/specwatt/motion-tokens.ts');
 assert.equal(motionDuration('standard',true),0);
 assert.equal(motionDuration('standard',false),motion.duration.standard);
 assert.equal(normalizedPower(null,7),null);
 assert.equal(normalizedPower(NaN,7),null);
 assert.equal(normalizedPower(4.2,0),null);
 assert.equal(normalizedPower(10,7),1);
 assert.equal(normalizedPower(-1,7),null);
 assert.equal(normalizedPower(4.2,7),.6);
 assert.ok(motion.spring.damping>0&&motion.spring.stiffness>0);
});
