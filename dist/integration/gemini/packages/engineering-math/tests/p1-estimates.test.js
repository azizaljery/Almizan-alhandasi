import test from 'node:test';
import assert from 'node:assert/strict';
import { CustomerBenefits } from '../src/customer-benefits.js';
test('G07 area BOQ is a labelled heuristic estimate, not executable takeoff',()=>{
  const result=CustomerBenefits.generateBillOfQuantities(400,12);
  assert.equal(result.estimateMetadata.classification,'ESTIMATE');assert.equal(result.estimateMetadata.executionReady,false);
  assert.equal(result.reinforcementSteelTons,6.16);assert.equal(result.concreteVolumeM3,140);
});
test('G07 fixed legacy prices expose unavailable source/date and are not current market data',()=>{
  for(const item of ['REINFORCING_STEEL_TON','UNKNOWN']){
    const out=CustomerBenefits.priceVerification(item,3100);assert.equal(out.benchmarkMetadata.currentMarketPrice,false);assert.equal(out.benchmarkMetadata.sourceDate,null);assert.equal(out.benchmarkMetadata.externalVerification,'NOT_AVAILABLE');
  }
});
test('G02 estimates reject malformed and non-finite scalars',()=>{
  for(const value of [NaN,Infinity,-1,0,'400',null])assert.throws(()=>CustomerBenefits.generateBillOfQuantities(value,12));
  for(const value of [NaN,Infinity,'12',0,1.5])assert.throws(()=>CustomerBenefits.generateBillOfQuantities(400,value));
  assert.throws(()=>CustomerBenefits.priceVerification('REINFORCING_STEEL_TON',NaN));
});
