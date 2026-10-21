import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewProviderPrice} from '../src/byok-price.mjs';

for(const [raw,wire] of [
  ['0.0000001',.1],['0.0000002',.2],['0.00000005',.05],['0.0000003',.3],
  ['1e-7',.1],['0.0000012345',1.2345],['0',0],['0.000000000001',.000001],
  [0.0000001,.1],['0.000000120000',.12]
])test(`catalogue ${raw} stays exactly ${wire} dollars per million on the JSON wire`,()=>{
  const price=reviewProviderPrice({prompt:raw,completion:raw,request:'0'});
  assert.deepEqual(JSON.parse(JSON.stringify(price)),{prompt:wire,completion:wire,request:0});
});

for(const raw of [null,undefined,'','-0.00001','NaN',Infinity,true,{},'1e1000','0.000000123456789123456789','1e-999'])
  test(`unsupported or lossy catalogue price ${String(raw)} is refused rather than widened`,()=>{
    assert.throws(()=>reviewProviderPrice({prompt:raw,completion:'0.0000001'}),/BYOK_PRICE_UNKNOWN/);
  });

test('request fees remain per-request, not multiplied by a million',()=>{
  assert.deepEqual(reviewProviderPrice({prompt:'1e-7',completion:'2e-7',request:'0.0003'}),{prompt:.1,completion:.2,request:.0003});
  assert.equal(reviewProviderPrice({prompt:'0',completion:'0'}).request,0);
});

test('regression: the old multiply is below the catalogue at a common strict routing boundary',()=>{
  const old=Number('0.0000001')*1e6;
  assert.ok(old<.1);
  const current=reviewProviderPrice({prompt:'0.0000001',completion:'0.0000001'});
  assert.equal(current.completion,.1);assert.equal(current.completion<=.1,true);
});
