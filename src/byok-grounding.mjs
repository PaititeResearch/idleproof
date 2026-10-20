// Explicit BYOK preview only. Read immutable captured windows via the trusted Core
// CLI; never read the working tree, execute project code, or expand selected paths.
import {runStructureCommand} from './project-scan.mjs';
import {PORTAL_SECRET_PATTERNS} from './portal-snapshot.mjs';

const PACKET_BYTES=24*1024, FILE_BYTES=4096;
const safePath=p=>typeof p==='string'&&p.length>0&&p.length<=4096&&!/[\\:\u0000-\u001f\u007f-\u009f]/.test(p)&&p.split('/').every(v=>v&&v!=='.'&&v!=='..');
const bytes=value=>Buffer.byteLength(JSON.stringify(value));
export async function readCapturedWindow(cwd,entry,{timeoutMs=1500}={}) {
  return runStructureCommand(cwd,['source','--snapshot',entry.snapshotId,'--path',entry.path,'--line','1','--limit','40'],{timeoutMs});
}
function checkedWindow(value,entry) {
  if(!value||value.schema!=='structure-source-1'||value.snapshotId!==entry.snapshotId||value.path!==entry.path||value.sourceSha256!==entry.sourceSha256||value.authority!=='OBSERVED'||!Array.isArray(value.lines)||value.lines.length>40||value.lines.some((v,i)=>!v||v.line!==i+1||typeof v.text!=='string'||v.text.length>2000||/[\r\n\u0000]/.test(v.text)||typeof v.truncated!=='boolean'))throw new Error('BYOK_SOURCE_MISMATCH');
  const totalLines=value.totalLines;
  if(totalLines!==undefined&&(!Number.isInteger(totalLines)||totalLines<0||value.lines.length!==Math.min(40,totalLines)))throw new Error('BYOK_SOURCE_MISMATCH');
  // Clone expressions: do not mutate the shared redaction regular expressions.
  const raw=value.lines.map(v=>v.text).join('\n');
  let code=raw;
  for(const pattern of PORTAL_SECRET_PATTERNS)code=code.replace(new RegExp(pattern.source,pattern.flags),'[redacted]');
  // A redacted line can change Python control flow or literals. Withhold the
  // entire window rather than presenting damaged code as an exact excerpt.
  if(code!==raw)return {status:'redacted',reason:'Sensitive text omitted; do not infer the missing code.'};
  const lines=[];
  for(const line of value.lines) {
    if(line.truncated||bytes([...lines,line.text])>FILE_BYTES)break;
    lines.push(line.text);
  }
  return {status:'captured-window',startLine:1,endLine:lines.length,code:lines.join('\n'),
    truncated:totalLines===undefined||lines.length<totalLines,totalLines:totalLines??null,
    scope:'Only these captured lines; no runtime or whole-project guarantee.'};
}
export async function groundedPacket(cwd,packet,{readSource=readCapturedWindow,signal=null}={}) {
  const result=structuredClone(packet);
  result.grounding={mode:'captured-windows',maxLinesPerFile:40,maxBytesPerFile:FILE_BYTES,packetByteLimit:PACKET_BYTES,
    meaning:'Indentation and imports are preserved within admitted windows. Missing lines are not evidence of absence.'};
  if(!packet.includeSource){if(bytes(result)>PACKET_BYTES)throw new Error('BYOK_CONTEXT_BUDGET');return result;}
  for(const entry of result.evidence) {
    if(!safePath(entry.path)||!/^dwscan_[a-f0-9]{64}$/.test(entry.snapshotId)||!/^[a-f0-9]{64}$/.test(entry.sourceSha256))throw new Error('BYOK_SOURCE_MISMATCH');
    entry.sourceExcerpt={status:'unavailable'};
  }
  if(bytes(result)>PACKET_BYTES)throw new Error('BYOK_CONTEXT_BUDGET');
  const deadline=Date.now()+8000;
  for(const entry of result.evidence) {
    signal?.throwIfAborted();
    const remaining=deadline-Date.now();
    if(remaining<=0){entry.sourceExcerpt={status:'unavailable'};continue;}
    let source;
    try{source=await readSource(cwd,entry,{timeoutMs:Math.min(1500,remaining)});}
    catch{signal?.throwIfAborted();continue;}
    signal?.throwIfAborted();
    entry.sourceExcerpt=checkedWindow(source,entry);
    if(bytes(result)>PACKET_BYTES)entry.sourceExcerpt={status:'omitted-budget'};
    // The smaller fixed status can still overflow a near-full original packet.
    if(bytes(result)>PACKET_BYTES)throw new Error('BYOK_CONTEXT_BUDGET');
  }
  return result;
}
