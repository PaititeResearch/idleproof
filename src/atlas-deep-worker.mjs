// Trusted parser worker. Source bytes are input data, never imported or evaluated.
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import {boundedProcess,analyzerEnv,DEEP_WORKER_ERRORS} from './atlas-deep-process.mjs';
const controller=new AbortController();
process.on('SIGTERM',()=>controller.abort());
const here=path.dirname(fileURLToPath(import.meta.url));
let size=0,parts=[];
try{
  for await(const part of process.stdin){size+=part.length;if(size>8*1024*1024)throw new Error('ATLAS_DEEP_INPUT_LIMIT');parts.push(part);}
  const input=JSON.parse(Buffer.concat(parts)),results=[];
  const python=async name=>JSON.parse((await boundedProcess(input.pythonCommand,['-I',path.join(here,name)],{cwd:here,input:JSON.stringify(input),signal:controller.signal,env:analyzerEnv(),timeoutMs:45000})).toString('utf8'));
  if(input.files.some(f=>/\.py$/.test(f.path)))results.push(await python('atlas-deep-python.py'));
  if(input.files.some(f=>/\.(?:[cm]?js|jsx|tsx?)$/.test(f.path))){const {analyzeJavaScript}=await import('./atlas-deep-javascript.mjs');results.push(await analyzeJavaScript(input));}
  if(input.files.some(f=>/\.(?:json|toml|sql|ya?ml)$/.test(f.path))&&fs.existsSync(path.join(here,'atlas-deep-data.py')))results.push(await python('atlas-deep-data.py'));
  if(controller.signal.aborted)throw new Error('cancelled');
  const output=JSON.stringify(results);if(Buffer.byteLength(output)>16*1024*1024)throw new Error('ATLAS_DEEP_OUTPUT_LIMIT');process.stdout.write(output);
}catch(error){process.stdout.write(JSON.stringify({schema:'idleproof.atlas-deep-error.v1',error:DEEP_WORKER_ERRORS.includes(error?.message)?error.message:'ATLAS_DEEP_PROCESS_FAILED'}));}
