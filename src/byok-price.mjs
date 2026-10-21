// Preserve catalogue decimal prices when converting dollars/token to dollars/M.
// Multiplying binary floats can serialize 0.0000001 as 0.09999999999999999/M,
// wrongly filtering out an endpoint priced at exactly 0.1/M. No epsilon,
// availability markup or rounding above the catalogue's decimal is allowed.
function decimal(value) {
  if(!['string','number'].includes(typeof value))throw new Error('BYOK_PRICE_UNKNOWN');
  const text=String(value);
  if(text.length>128)throw new Error('BYOK_PRICE_UNKNOWN');
  const match=/^(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d{1,3}))?$/.exec(text);
  if(!match)throw new Error('BYOK_PRICE_UNKNOWN');
  let digits=(match[1]+(match[2]||'')).replace(/^0+/,'');
  let exponent=Number(match[3]||0)-(match[2]||'').length;
  if(!digits)return {digits:'0',exponent:0};
  while(digits.endsWith('0')){digits=digits.slice(0,-1);exponent++;}
  return {digits,exponent};
}
function shifted(value,places) {
  const original=decimal(value);
  const expected={...original,exponent:original.digits==='0'?0:original.exponent+places};
  const number=Number(`${expected.digits}e${expected.exponent}`);
  if(!Number.isFinite(number)||number<0)throw new Error('BYOK_PRICE_UNKNOWN');
  // The JSON wire decimal must equal the advertised rate, not a nearby rate.
  const wire=decimal(number);
  if(wire.digits!==expected.digits||wire.exponent!==expected.exponent)throw new Error('BYOK_PRICE_UNKNOWN');
  return number;
}
export function reviewProviderPrice(pricing) {
  return {prompt:shifted(pricing?.prompt,6),completion:shifted(pricing?.completion,6),request:shifted(pricing?.request??'0',0)};
}
