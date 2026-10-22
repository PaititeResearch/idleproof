// Process bounds for trusted analyzers. This is NOT a sandbox for target execution.
import {spawn} from 'node:child_process';
// Only fixed resource diagnostics may cross the worker boundary; no source text.
export const DEEP_WORKER_ERRORS=Object.freeze(['ATLAS_DEEP_JS_NODE_LIMIT','ATLAS_DEEP_JS_EDGE_LIMIT','ATLAS_DEEP_JS_CALL_LIMIT','ATLAS_DEEP_JS_BYTE_LIMIT','ATLAS_DEEP_JS_DEPTH_LIMIT','ATLAS_DEEP_OUTPUT_LIMIT','ATLAS_DEEP_INPUT_LIMIT','ATLAS_DEEP_PROCESS_FAILED','ATLAS_DEEP_PROCESS_UNAVAILABLE']);
export function boundedProcess(command,args,{cwd,input='',signal,timeoutMs=60000,maxBytes=16*1024*1024,env,processGroup=false}={}) {
  return new Promise((resolve,reject)=>{
    if(signal?.aborted)return reject(new Error('ATLAS_DEEP_CANCELLED'));
    const group=processGroup&&process.platform!=='win32';
    const child=spawn(command,args,{cwd,env,detached:group,windowsHide:true,stdio:['pipe','pipe','pipe']});
    let parts=[],size=0,problem=null,done=false,hardKill;
    const kill=signal=>{try{if(group)process.kill(-child.pid,signal);else child.kill(signal);}catch{}};
    const stop=code=>{if(problem)return;problem=code;parts=[];kill('SIGTERM');hardKill=setTimeout(()=>kill('SIGKILL'),500);hardKill.unref();};
    const abort=()=>stop('ATLAS_DEEP_CANCELLED');signal?.addEventListener('abort',abort,{once:true});
    const timer=setTimeout(()=>stop('ATLAS_DEEP_TIMEOUT'),timeoutMs);timer.unref();
    const finish=(error,value)=>{if(done)return;done=true;if(problem&&group)kill('SIGKILL');clearTimeout(timer);clearTimeout(hardKill);signal?.removeEventListener('abort',abort);error?reject(new Error(error)):resolve(value);};
    child.stdout.on('data',chunk=>{size+=chunk.length;if(size>maxBytes)stop('ATLAS_DEEP_OUTPUT_LIMIT');else if(!problem)parts.push(chunk);});
    child.stderr.resume(); // Never retain arbitrary diagnostic source text or secrets.
    child.stdin.on('error',()=>{});
    child.once('error',()=>finish('ATLAS_DEEP_PROCESS_UNAVAILABLE'));
    child.once('close',code=>finish(problem||(code!==0?'ATLAS_DEEP_PROCESS_FAILED':null),Buffer.concat(parts)));
    child.stdin.end(input);
  });
}
export function analyzerEnv(){return {PATH:process.env.PATH||'',...(process.env.SystemRoot?{SystemRoot:process.env.SystemRoot}:{}),LANG:'C.UTF-8',PYTHONHASHSEED:'0',PYTHONDONTWRITEBYTECODE:'1'};}
