import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {admitDeepResults} from '../src/atlas-deep.mjs';

const providerPath=fileURLToPath(new URL('../src/atlas-deep-data.py',import.meta.url));
const candidates=process.platform==='win32'?['python','python3']:['python3','python'];
const python=candidates.find(command=>spawnSync(command,['-I','-S','-c','import sys;sys.exit(0 if sys.version_info >= (3, 9) else 1)'],{timeout:5000,stdio:'pipe'}).status===0);
const options={skip:!python?'Python >=3.9 unavailable: data provider qualification NOT_RUN':false};
const identity={snapshotId:`dwscan_${'a'.repeat(64)}`,tree:'b'.repeat(40),source:'HEAD'};
const hash=content=>createHash('sha256').update(content).digest('hex');
const file=(path,content)=>({path,content,sourceSha256:hash(content)});
function run(files,changedIdentity=identity){return rawRun(JSON.stringify({identity:changedIdentity,files}));}
function rawRun(input){
  const result=spawnSync(python,['-I','-S',providerPath],{input,encoding:'utf8',timeout:10000,maxBuffer:5*1024*1024});
  assert.equal(result.error,undefined);
  assert.equal(result.status,0,result.stderr);
  assert.equal(result.stderr,'');
  return JSON.parse(result.stdout);
}

test('data provider parses complete JSON, inventories names, and never retains values',options,()=>{
  const result=run([file('config.json',JSON.stringify({database:{password:'unique-secret-cannot-appear',port:654321},enabled:true,items:[{name:'another-secret-value'}]}))]);
  assert.equal(result.coverage.parsedFiles,1);
  assert.equal(result.coverage.syntaxValidationComplete,true);
  assert.equal(result.coverage.keyProjectionComplete,true);
  assert.equal(result.coverage.complete,false);
  assert.deepEqual(result.edges,[]);
  assert.deepEqual(result.callSites,[]);
  assert.deepEqual(result.nodes.map(n=>n.qualifiedName).sort(),['/database','/database/password','/database/port','/enabled','/items','/items/0/name']);
  assert.equal(result.nodes.find(n=>n.qualifiedName==='/database').kind,'config-section');
  const serialized=JSON.stringify(result);
  for(const value of ['unique-secret-cannot-appear','654321','another-secret-value'])assert.equal(serialized.includes(value),false);
  for(const node of result.nodes){
    assert.equal(node.authority,'OBSERVED');
    assert.deepEqual([node.source.line,node.source.endLine,node.source.column,node.source.endColumn,node.source.locationScope],[1,1,null,null,'file-anchor']);
    assert.equal(node.source.snapshotId,identity.snapshotId);
    assert.equal(node.source.provider,'data-stdlib');
    assert.equal(node.source.providerVersion,'1');
  }
});

test('JSON keys use unambiguous pointers including escaped and Unicode names',options,()=>{
  const result=run([file('names.json','{"a/b":{"~name":0},"élève":1,"\\ud800":2}')]);
  assert.deepEqual(result.nodes.map(n=>n.qualifiedName).sort(),['/a~1b','/a~1b/~0name','/élève','/\ud800'].sort());
  assert.equal(new Set(result.nodes.map(n=>n.id)).size,4);
});

test('TOML parses tables and dotted keys without pretending to locate headers',options,()=>{
  const result=run([file('settings.toml','title = "not-retained-title"\n[database]\npassword = "secret-toml-password"\nconnection.port = 5432\n[[servers]]\nname = "secret-host"\n')]);
  if(result.capabilities.tomlCompleteDocumentParse==='UNSUPPORTED'){
    assert.equal(result.coverage.unsupportedFiles,1);
    assert.deepEqual(result.nodes,[]);
    return;
  }
  assert.equal(result.coverage.parsedFiles,1);
  for(const pointer of ['/database','/database/connection'])assert.equal(result.nodes.find(n=>n.qualifiedName===pointer).kind,'config-section');
  assert.ok(result.nodes.some(n=>n.qualifiedName==='/servers/0/name'));
  for(const secret of ['not-retained-title','secret-toml-password','secret-host','5432'])assert.equal(JSON.stringify(result).includes(secret),false);
  assert.ok(result.limitations.some(value=>value.includes('explicit section header')));
});

test('SQL and YAML remain explicitly unsupported and do not acquire inferred links',options,()=>{
  const result=run([file('schema.sql','CREATE TABLE service (process TEXT);'),file('config.yaml','handler: service.process\n'),file('config.yml','token: secret-yaml-value\n')]);
  assert.equal(result.coverage.unsupportedFiles,3);
  assert.equal(result.coverage.syntaxValidationComplete,false);
  assert.ok(result.coverage.files.every(f=>f.status==='UNSUPPORTED'&&f.syntaxValidated===false));
  assert.deepEqual(result.nodes,[]);
  assert.deepEqual(result.edges,[]);
  assert.equal(JSON.stringify(result).includes('secret-yaml-value'),false);
});

test('malformed and trailing JSON cannot contribute partial facts or diagnostic source text',options,()=>{
  const result=run([file('good.json','{"ok":1}'),file('bad.json','{"secret-malformed-name":'),file('trailing.json','{"partial":1} trailing-secret')]);
  assert.equal(result.coverage.parsedFiles,1);
  assert.equal(result.coverage.invalidFiles,2);
  assert.deepEqual(result.nodes.map(n=>n.qualifiedName),['/ok']);
  assert.ok(result.coverage.files.filter(f=>f.status==='INVALID').every(f=>f.reason==='DOCUMENT_PARSE_FAILED'));
  assert.equal(JSON.stringify(result).includes('secret-malformed-name'),false);
  assert.equal(JSON.stringify(result).includes('trailing-secret'),false);
});

test('duplicate JSON keys including escaped equivalents and nested duplicates are rejected',options,()=>{
  for(const content of ['{"a":1,"a":2}','{"a":1,"\\u0061":2}','{"outer":{"key":1,"key":2}}']){
    const result=run([file('duplicates.json',content)]);
    assert.deepEqual(result.nodes,[]);
    assert.equal(result.coverage.files[0].reason,'DUPLICATE_JSON_KEY');
    assert.equal(result.coverage.files[0].syntaxValidated,false);
  }
});

test('non-standard JSON constants are not accepted as valid JSON documents',options,()=>{
  for(const content of ['{"n":NaN}','{"n":Infinity}','{"n":-Infinity}']){
    const result=run([file('numbers.json',content)]);
    assert.deepEqual(result.nodes,[]);
    assert.equal(result.coverage.files[0].reason,'NONSTANDARD_JSON_NUMBER');
  }
});

test('duplicate and malformed TOML is rejected without leaking parser snippets',options,()=>{
  for(const content of ['secretkey="secret-first"\nsecretkey="secret-second"','[table\nsecretkey="secret-third"']){
    const result=run([file('bad.toml',content)]);
    assert.deepEqual(result.nodes,[]);
    if(result.capabilities.tomlCompleteDocumentParse==='SUPPORTED')assert.equal(result.coverage.files[0].reason,'DOCUMENT_PARSE_FAILED');
    assert.equal(JSON.stringify(result).includes('secret-first'),false);
    assert.equal(JSON.stringify(result).includes('secret-third'),false);
  }
});

test('source digest mismatch invalidates a document before any parsing claim',options,()=>{
  const result=run([{...file('config.json','{"key":"value"}'),sourceSha256:'0'.repeat(64)}]);
  assert.deepEqual(result.nodes,[]);
  assert.equal(result.coverage.invalidFiles,1);
  assert.equal(result.coverage.files[0].reason,'SOURCE_HASH_MISMATCH');
});

test('unsafe or duplicate paths and invalid snapshot identity fail the whole request',options,()=>{
  for(const path of ['../config.json','/absolute.json','a//b.json','a\\b.json','C:config.json'])assert.equal(run([file(path,'{}')]).error,'INVALID_SOURCE_PATH');
  assert.equal(run([file('same.json','{}'),file('same.json','{}')]).error,'DUPLICATE_SOURCE_PATH');
  assert.equal(run([],{snapshotId:'unbound'}).error,'INVALID_SNAPSHOT_ID');
});

test('node identity is deterministic, order-independent and bound to snapshot/path/bytes',options,()=>{
  const first=file('a.json','{"a":1}'),second=file('b.json','{"b":2}');
  assert.deepEqual(run([first,second]),run([second,first]));
  const baseline=run([first]).nodes[0].id;
  for(const result of [run([file('renamed.json',first.content)]),run([file(first.path,'{"a":2}')]),run([first],{...identity,snapshotId:`dwscan_${'c'.repeat(64)}`})])assert.notEqual(result.nodes[0].id,baseline);
});

test('per-file byte limits and file count limits are explicit',options,()=>{
  const result=run([file('large.json',JSON.stringify({key:'x'.repeat(256*1024)}))]);
  assert.deepEqual(result.nodes,[]);
  assert.equal(result.coverage.truncatedFiles,1);
  assert.equal(result.coverage.files[0].reason,'FILE_BYTE_LIMIT');
  assert.equal(result.coverage.files[0].syntaxValidated,false);
  assert.equal(run(Array.from({length:257},(_,i)=>file(`${i}.json`,'{}'))).error,'INVALID_FILE_COUNT');
});

test('node admission limits disclose omissions instead of claiming a complete inventory',options,()=>{
  const result=run([file('many.json',JSON.stringify(Object.fromEntries(Array.from({length:4500},(_,i)=>[`key${i}`,i]))))]);
  assert.equal(result.nodes.length,4096);
  assert.equal(result.coverage.omittedNodes,404);
  assert.equal(result.coverage.files[0].status,'TRUNCATED');
  assert.equal(result.coverage.syntaxValidationComplete,true);
  assert.equal(result.coverage.keyProjectionComplete,false);
});

test('depth and oversized names produce explicit incomplete projection',options,()=>{
  let nested={last:1};
  for(let i=0;i<70;i++)nested={child:nested};
  const result=run([file('deep.json',JSON.stringify(nested)),file('long.json',JSON.stringify({['x'.repeat(513)]:{hidden:1}}))]);
  assert.equal(result.coverage.parsedFiles,2);
  assert.equal(result.coverage.truncatedFiles,2);
  assert.ok(result.coverage.omittedContainers>=2);
  assert.equal(result.coverage.keyProjectionComplete,false);
});

test('bounded malformed envelopes fail without source echo or traceback',options,()=>{
  assert.equal(rawRun('x'.repeat(4*1024*1024+1)).error,'INPUT_BYTE_LIMIT');
  assert.equal(rawRun('{"identity":').error,'INVALID_REQUEST_JSON');
  assert.equal(rawRun('{"identity":{},"identity":{}}').error,'DUPLICATE_JSON_KEY');
  assert.equal(rawRun('null').error,'INVALID_REQUEST_IDENTITY');
});

test('empty JSON keys remain exact pointers and admit a nonempty display label',options,()=>{
  const files=[file('empty-key.json','{"":1}')],result=run(files);
  assert.equal(result.nodes.length,1);assert.equal(result.nodes[0].qualifiedName,'/');assert.ok(result.nodes[0].label.length>0);
  const graph=admitDeepResults({identity,files,coverage:{}},[result]);assert.equal(graph.nodes.length,1);assert.equal(graph.nodes[0].qualifiedName,'/');
});
