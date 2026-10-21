// Read only bounded error metadata. Never retain/provider-echo messages, raw
// bodies, headers, request IDs, credentials, model output or project content.
const MAX_ERROR_BYTES=8192,MAX_ERROR_CHUNKS=256,ERROR_READ_MS=500;
const observed=new WeakMap();
const TYPES=new Set(['authentication','permission_denied','payment_required',
  'rate_limit_exceeded','provider_overloaded','provider_unavailable','not_found',
  'invalid_request','invalid_prompt','precondition_failed','payload_too_large',
  'unprocessable','content_policy_violation','refusal','context_length_exceeded',
  'max_tokens_exceeded','token_limit_exceeded','string_too_long','server','timeout','unmapped']);
const ROUTING_TYPES=new Set(['not_found','provider_unavailable','provider_overloaded']);

function classify(status,value) {
  const e=value?.error;
  if(!e||typeof e!=='object'||Array.isArray(e))return {};
  const type=e.metadata?.error_type;
  const result=TYPES.has(type)?{providerErrorType:type}:{};
  // A bare 404 is NOT proof of routing unavailability. Require the complete,
  // bounded JSON envelope to explicitly say so, with no conflicting type.
  if(status===404&&e.code===404&&typeof e.message==='string'&&e.message.length<=1024&&
    /^No endpoints found(?:$|[ .:])/i.test(e.message)&&
    (type===undefined||ROUTING_TYPES.has(type)))result.routingIssue='NO_ENDPOINTS_FOUND';
  return result;
}

// The caller keeps its original HTTP failure even if diagnostic decoding fails.
// A separate small deadline prevents an error body's stream from hanging a call.
export async function readByokHttpError(response,{signal}={}) {
  const status=Number.isInteger(response.status)&&response.status>=400&&response.status<=599?response.status:500;
  const error=new Error(`BYOK_HTTP_${status}`);
  let reader,timer,onAbort,finished=false;
  const diagnostic={httpStatus:status,errorBody:'unavailable'};
  try {
    if(signal?.aborted){diagnostic.errorBody='aborted';return error;}
    if(!response.body){diagnostic.errorBody='empty';return error;}
    reader=response.body.getReader();
    const end=new Promise(resolve=>{
      timer=setTimeout(()=>resolve({state:'deadline'}),ERROR_READ_MS);
      onAbort=()=>resolve({state:'aborted'});
      signal?.addEventListener('abort',onAbort,{once:true});
      if(signal?.aborted)onAbort();
    });
    const parts=[];let bytes=0;
    for(let chunks=0;chunks<MAX_ERROR_CHUNKS;chunks++) {
      const result=await Promise.race([reader.read().then(x=>({state:'chunk',...x}),()=>({state:'unreadable'})),end]);
      if(result.state!=='chunk'){diagnostic.errorBody=result.state;return error;}
      if(result.done){finished=true;break;}
      if(!(result.value instanceof Uint8Array)){diagnostic.errorBody='unreadable';return error;}
      bytes+=result.value.byteLength;
      if(bytes>MAX_ERROR_BYTES){diagnostic.errorBody='oversized';return error;}
      parts.push(result.value);
    }
    if(!finished){diagnostic.errorBody='chunk-limit';return error;}
    if(!bytes){diagnostic.errorBody='empty';return error;}
    let value;
    try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(parts)));}
    catch{diagnostic.errorBody='invalid-json';return error;}
    diagnostic.errorBody='json';Object.assign(diagnostic,classify(status,value));
  }catch{diagnostic.errorBody='unreadable';}
  finally {
    clearTimeout(timer);if(onAbort)signal?.removeEventListener('abort',onAbort);
    // Cancellation itself is best effort, never an unbounded extra await.
    if(reader&&!finished){try{Promise.resolve(reader.cancel()).catch(()=>{});}catch{}}
    if(reader&&finished){try{reader.releaseLock();}catch{}}
    observed.set(error,Object.freeze({...diagnostic}));
  }
  return error;
}

// Only metadata observed by the bounded reader can authorize this recovery.
// Do not accept similarly named fields on a thrown network error or model JSON.
export function byokHttpDiagnostics(error) {
  const value=observed.get(error);
  return value?{...value}:null;
}
