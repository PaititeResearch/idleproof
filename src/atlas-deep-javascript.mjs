// Exact parse-only TypeScript 5.9.3 provider. All source is supplied in memory.
// No CompilerHost, target imports, emit, plugins, tsconfig, filesystem resolution or evaluation.
import ts from './vendor/typescript-5.9.3/typescript.cjs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const PROVIDER=Object.freeze({name:'typescript',version:'5.9.3'});
const hash=x=>createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex');
const id=(kind,...parts)=>`js_${kind}_${hash(parts).slice(0,32)}`;
const validPath=p=>typeof p==='string'&&p.length>0&&p.length<=4096&&!/[\\:\x00-\x1f\x7f]/.test(p)&&p.split('/').every(x=>x&&x!=='.'&&x!=='..');
const suffix=/\.(?:[cm]?js|jsx|tsx?)$/;
const isFunction=n=>ts.isFunctionDeclaration(n)||ts.isFunctionExpression(n)||ts.isArrowFunction(n)||ts.isMethodDeclaration(n)||ts.isConstructorDeclaration(n)||ts.isGetAccessor(n)||ts.isSetAccessor(n);
const modifiers=(n,k)=>(n.modifiers||[]).some(m=>m.kind===k);
const decorator=n=>(n.modifiers||[]).some(m=>m.kind===ts.SyntaxKind.Decorator);
const assignment=k=>k>=ts.SyntaxKind.FirstAssignment&&k<=ts.SyntaxKind.LastAssignment;

export function analyzeJavaScript(input) {
  if(ts.version!==PROVIDER.version)throw new Error('ATLAS_DEEP_JS_PROVIDER_VERSION');
  if(!input?.identity?.snapshotId||!Array.isArray(input.files)||input.files.length>256)throw new Error('ATLAS_DEEP_JS_INPUT_INVALID');
  const nodes=[],edges=[],callSites=[],files=new Map(),nodeByAst=new Map(),scopeByAst=new Map(),ownerByAst=new Map(),nodeIds=new Set(),edgeIds=new Set();
  const pendingCalls=[],pendingAwait=[],pendingReturn=[],pendingConditions=[],pendingImports=[],mutations=[],allBindings=[];
  const coverage={files:0,parsedFiles:0,syntaxErrors:0,syntaxErrorFiles:[],unsupportedFiles:0,callSites:0,resolved:0,ambiguous:0,unknown:0,external:0,semanticCompleteness:'UNKNOWN'};
  let totalBytes=0;
  const addNode=n=>{if(nodes.length>=28000)throw new Error('ATLAS_DEEP_JS_NODE_LIMIT');if(nodeIds.has(n.id))throw new Error('ATLAS_DEEP_JS_ID_COLLISION');nodeIds.add(n.id);nodes.push(n);return n;};
  const addEdge=(from,to,kind,authority,source,extra={})=>{if(edges.length>=56000)throw new Error('ATLAS_DEEP_JS_EDGE_LIMIT');const e={id:id('edge',from,to,kind,source,extra),from,to,kind,authority,source,...extra};if(!edgeIds.has(e.id)){edgeIds.add(e.id);edges.push(e);}return e;};
  const source=(file,n)=>{const start=n===file.ast?0:n.getStart(file.ast),end=n.end;const a=file.ast.getLineAndCharacterOfPosition(start),b=file.ast.getLineAndCharacterOfPosition(end);return {snapshotId:input.identity.snapshotId,path:file.path,sourceSha256:file.sourceSha256,line:a.line+1,endLine:b.line+1,column:a.character,endColumn:b.character,language:file.path.endsWith('.ts')||file.path.endsWith('.tsx')?'typescript':'javascript',provider:PROVIDER.name,providerVersion:PROVIDER.version};};
  const make=(file,n,kind,label,ownerId,qualifiedName=label)=>{const s=source(file,n),v=addNode({id:id('node',input.identity.repositoryId||'',input.identity.snapshotId,file.path,kind,n.pos,n.end,label),kind,label:String(label).slice(0,4096)||kind,qualifiedName,path:file.path,authority:'OBSERVED',source:s,...(ownerId?{ownerId,scope:ownerId}:{})});nodeByAst.set(n,v);if(ownerId)addEdge(ownerId,v.id,'DEFINES','OBSERVED',s,{resolution:'lexical-syntax'});return v;};
  const newScope=(parent,file,ownerId,isFunctionScope=false)=>({parent,file,ownerId,isFunctionScope,bindings:new Map()});
  const bind=(scope,name,value)=>{if(!name)return;const entry={...value,name,scope,file:scope.file,mutated:false};const old=scope.bindings.get(name);if(old){old.duplicate=true;entry.duplicate=true;old.alternatives??=[];old.alternatives.push(entry);}else scope.bindings.set(name,entry);allBindings.push(entry);return entry;};
  const find=(scope,name)=>{for(let s=scope;s;s=s.parent)if(s.bindings.has(name))return s.bindings.get(name);return null;};
  const functionScope=s=>{while(s.parent&&!s.isFunctionScope)s=s.parent;return s;};
  const bindingNames=n=>ts.isIdentifier(n)?[n.text]:ts.isObjectBindingPattern(n)||ts.isArrayBindingPattern(n)?n.elements.flatMap(e=>ts.isBindingElement(e)?bindingNames(e.name):[]):[];
  const mark=(n,scope)=>{if(ts.isIdentifier(n)){const b=find(scope,n.text);if(b)b.mutated=true;}else if(ts.isArrayLiteralExpression(n)||ts.isObjectLiteralExpression(n))ts.forEachChild(n,x=>mark(x,scope));else if(ts.isShorthandPropertyAssignment(n))mark(n.name,scope);else if(ts.isPropertyAssignment(n))mark(n.initializer,scope);else if(ts.isBinaryExpression(n))mark(n.left,scope);else if(ts.isSpreadElement(n)||ts.isSpreadAssignment(n)||ts.isParenthesizedExpression(n))mark(n.expression,scope);};

  for(const f of [...input.files].sort((a,b)=>String(a.path).localeCompare(String(b.path),'en'))){
    if(!validPath(f.path)||typeof f.content!=='string'||hash(f.content)!==f.sourceSha256||files.has(f.path))throw new Error('ATLAS_DEEP_JS_SOURCE_INVALID');
    totalBytes+=Buffer.byteLength(f.content);if(Buffer.byteLength(f.content)>262144||totalBytes>4194304)throw new Error('ATLAS_DEEP_JS_BYTE_LIMIT');
    if(!suffix.test(f.path)){coverage.unsupportedFiles++;continue;}
    const kind=/\.tsx$/.test(f.path)?ts.ScriptKind.TSX:/\.jsx$/.test(f.path)?ts.ScriptKind.JSX:/\.ts$/.test(f.path)?ts.ScriptKind.TS:ts.ScriptKind.JS;
    const ast=ts.createSourceFile(f.path,f.content,ts.ScriptTarget.ESNext,true,kind),file={...f,ast,exports:new Map(),dynamic:false,moduleScope:/\.mjs$/.test(f.path)||ts.isExternalModule(ast),parsed:ast.parseDiagnostics.length===0};
    files.set(f.path,file);coverage.files++;
    file.module=make(file,ast,'module',f.path,null);file.scope=newScope(null,file,file.module.id,true);
    if(!file.parsed){coverage.syntaxErrors+=ast.parseDiagnostics.length;coverage.syntaxErrorFiles.push({path:f.path,diagnosticCodes:ast.parseDiagnostics.map(d=>d.code).slice(0,20)});continue;}
    coverage.parsedFiles++;
  }
  const exported=(file,name,b)=>{if(file.exports.has(name))file.exports.set(name,{kind:'unknown',reason:'duplicate export'});else file.exports.set(name,b);};
  function walk(file,n,scope,ownerId,qualified,depth=0){
    if(depth>500)throw new Error('ATLAS_DEEP_JS_DEPTH_LIMIT');scopeByAst.set(n,scope);ownerByAst.set(n,ownerId);
    if(n!==file.ast&&ts.isBlock(n)){const s=newScope(scope,file,ownerId);for(const st of n.statements)walk(file,st,s,ownerId,qualified,depth+1);return;}
    if(ts.isCaseBlock(n)){const s=newScope(scope,file,ownerId);for(const clause of n.clauses)walk(file,clause,s,ownerId,qualified,depth+1);return;}
    if(ts.isCatchClause(n)){const s=newScope(scope,file,ownerId);if(n.variableDeclaration)for(const name of bindingNames(n.variableDeclaration.name))bind(s,name,{kind:'unknown',reason:'catch parameter'});walk(file,n.block,s,ownerId,qualified,depth+1);return;}
    if(ts.isForStatement(n)||ts.isForInStatement(n)||ts.isForOfStatement(n)){const s=newScope(scope,file,ownerId);scopeByAst.set(n,s);if((ts.isForInStatement(n)||ts.isForOfStatement(n))&&!ts.isVariableDeclarationList(n.initializer))mutations.push([n.initializer,s]);ts.forEachChild(n,x=>walk(file,x,s,ownerId,qualified,depth+1));return;}
    if(isFunction(n)){
      // Computed names and decorators execute in the enclosing environment.
      if(n.name&&ts.isComputedPropertyName(n.name))walk(file,n.name.expression,scope,ownerId,qualified,depth+1);
      for(const modifier of n.modifiers||[])if(ts.isDecorator(modifier))walk(file,modifier.expression,scope,ownerId,qualified,depth+1);
      const name=n.name&&ts.isIdentifier(n.name)?n.name.text:ts.isConstructorDeclaration(n)?'constructor':ts.isVariableDeclaration(n.parent)&&ts.isIdentifier(n.parent.name)?n.parent.name.text:`<closure@${source(file,n).line}:${source(file,n).column}>`;
      const kind=ts.isMethodDeclaration(n)||ts.isGetAccessor(n)||ts.isSetAccessor(n)?'method':ts.isConstructorDeclaration(n)?'constructor':ts.isArrowFunction(n)||ts.isFunctionExpression(n)?'closure':modifiers(n,ts.SyntaxKind.AsyncKeyword)?'async-function':'function';
      const v=make(file,n,kind,name,ownerId,`${qualified}.${name}`),s=newScope(scope,file,v.id,true);scopeByAst.set(n,s);ownerByAst.set(n,v.id);
      const conditional=ts.isFunctionDeclaration(n)&&!ts.isSourceFile(n.parent)&&!ts.isBlock(n.parent)&&!ts.isModuleBlock(n.parent);
      const b={kind:n.body&&!conditional?'function':'unknown',node:v,ast:n,decorated:decorator(n),reason:conditional?'Conditional Annex B declaration is unsupported':n.body?'lexical function declaration':'signature has no implementation'};
      if(ts.isFunctionDeclaration(n)&&n.name){const bound=bind(scope,n.name.text,b);if(scope===file.scope&&modifiers(n,ts.SyntaxKind.ExportKeyword))exported(file,modifiers(n,ts.SyntaxKind.DefaultKeyword)?'default':n.name.text,bound);}
      if(ts.isFunctionDeclaration(n)&&!n.name&&modifiers(n,ts.SyntaxKind.DefaultKeyword))exported(file,'default',{...b,file,scope});
      if(ts.isFunctionExpression(n)&&n.name)bind(s,n.name.text,b);
      for(const p of n.parameters||[]){for(const pname of bindingNames(p.name)){const pn=make(file,p,'parameter',pname,v.id,`${v.qualifiedName}.${pname}`);bind(s,pname,{kind:'parameter',node:pn,ast:p});}walk(file,p.name,s,v.id,v.qualifiedName,depth+1);for(const modifier of p.modifiers||[])if(ts.isDecorator(modifier))walk(file,modifier.expression,scope,ownerId,qualified,depth+1);if(p.initializer)walk(file,p.initializer,s,v.id,v.qualifiedName,depth+1);}
      // Parameter initializers cannot see function-body declarations. Keep their
      // environment outside the body even when there are no default parameters.
      if(n.body){const bodyScope=newScope(s,file,v.id,true);if(ts.isBlock(n.body)){scopeByAst.set(n.body,bodyScope);ownerByAst.set(n.body,v.id);for(const st of n.body.statements)walk(file,st,bodyScope,v.id,v.qualifiedName,depth+1);}else walk(file,n.body,bodyScope,v.id,v.qualifiedName,depth+1);}return;
    }
    if(ts.isClassDeclaration(n)||ts.isClassExpression(n)){
      const name=n.name?.text||`<class@${source(file,n).line}>`,v=make(file,n,'class',name,ownerId,`${qualified}.${name}`),s=newScope(scope,file,v.id);
      const b={kind:'class',node:v,ast:n,decorated:decorator(n),inherits:Boolean(n.heritageClauses?.length)};
      if(ts.isClassDeclaration(n)&&n.name){const bound=bind(scope,name,b);if(scope===file.scope&&modifiers(n,ts.SyntaxKind.ExportKeyword))exported(file,modifiers(n,ts.SyntaxKind.DefaultKeyword)?'default':name,bound);}
      if(n.name)bind(s,name,b);
      for(const modifier of n.modifiers||[])if(ts.isDecorator(modifier))walk(file,modifier.expression,scope,ownerId,qualified,depth+1);
      for(const clause of n.heritageClauses||[])if(clause.token===ts.SyntaxKind.ExtendsKeyword)for(const type of clause.types)walk(file,type.expression,scope,ownerId,qualified,depth+1);
      for(const member of n.members)walk(file,member,s,v.id,v.qualifiedName,depth+1);return;
    }
    if(ts.isInterfaceDeclaration(n)){make(file,n,'interface',n.name.text,ownerId,`${qualified}.${n.name.text}`);return;}
    if(ts.isTypeAliasDeclaration(n)){return;}
    if(ts.isModuleDeclaration(n)){const name=n.name.text,v=make(file,n,'namespace',name,ownerId,`${qualified}.${name}`);bind(scope,name,{kind:'unknown',reason:'TypeScript namespace runtime object is unsupported',node:v,ast:n});if(n.body)walk(file,n.body,newScope(scope,file,v.id),v.id,v.qualifiedName,depth+1);return;}
    if(ts.isEnumDeclaration(n)){const v=make(file,n,'enum',n.name.text,ownerId,`${qualified}.${n.name.text}`);bind(scope,n.name.text,{kind:'unknown',node:v,ast:n,reason:'Enum is not a qualified callable binding'});const s=newScope(scope,file,ownerId);for(const member of n.members)if(ts.isIdentifier(member.name))bind(s,member.name.text,{kind:'unknown',reason:'Enum member initialization is unsupported'});for(const member of n.members)if(member.initializer)walk(file,member.initializer,s,ownerId,qualified,depth+1);return;}
    if(ts.isImportDeclaration(n)&&ts.isStringLiteral(n.moduleSpecifier)){
      const spec=n.moduleSpecifier.text,clause=n.importClause;pendingImports.push({file,n,spec,typeOnly:Boolean(clause?.isTypeOnly)||(clause?.namedBindings&&ts.isNamedImports(clause.namedBindings)&&!clause.name&&clause.namedBindings.elements.length>0&&clause.namedBindings.elements.every(e=>e.isTypeOnly))});if(!clause)return;
      const entry=(name,imported,typeOnly=false)=>bind(scope,name,{kind:typeOnly||clause.isTypeOnly?'type-import':'import',spec,imported,ast:n});
      if(clause.name)entry(clause.name.text,'default');const nb=clause.namedBindings;
      if(nb&&ts.isNamespaceImport(nb))entry(nb.name.text,'*');
      if(nb&&ts.isNamedImports(nb))for(const e of nb.elements)entry(e.name.text,e.propertyName?.text||e.name.text,e.isTypeOnly);
      return;
    }
    if(ts.isImportEqualsDeclaration(n)){bind(scope,n.name.text,{kind:'unknown',reason:'TypeScript import-equals/CommonJS is unsupported',ast:n});return;}
    if(ts.isVariableDeclaration(n)){
      const declarationList=n.parent,isConst=ts.isVariableDeclarationList(declarationList)&&Boolean(declarationList.flags&ts.NodeFlags.Const),isVar=ts.isVariableDeclarationList(declarationList)&&!(declarationList.flags&(ts.NodeFlags.Const|ts.NodeFlags.Let)),target=isVar?functionScope(scope):scope;
      for(const name of bindingNames(n.name)){const v=make(file,n,'variable',name,ownerId,`${qualified}.${name}`),b=bind(target,name,{kind:ts.isIdentifier(n.name)&&isConst&&n.initializer?'constant':'unknown',node:v,ast:n,initializer:n.initializer,reason:'mutable or destructured variable'});if(scope===file.scope&&ts.isVariableStatement(declarationList.parent)&&modifiers(declarationList.parent,ts.SyntaxKind.ExportKeyword))exported(file,name,b);}
      walk(file,n.name,scope,ownerId,qualified,depth+1);if(n.initializer)walk(file,n.initializer,scope,ownerId,qualified,depth+1);return;
    }
    if(ts.isExportDeclaration(n)&&n.exportClause&&ts.isNamedExports(n.exportClause)){
      const spec=n.moduleSpecifier&&ts.isStringLiteral(n.moduleSpecifier)?n.moduleSpecifier.text:null;
      for(const e of n.exportClause.elements)exported(file,e.name.text,{kind:n.isTypeOnly||e.isTypeOnly?'type-import':'export',spec,imported:e.propertyName?.text||e.name.text,file,scope,ast:n});return;
    }
    if(ts.isExportAssignment(n)){exported(file,'default',{kind:'default-expression',expression:n.expression,file,scope,ast:n});walk(file,n.expression,scope,ownerId,qualified,depth+1);return;}
    if(ts.isWithStatement(n)||(ts.isIdentifier(n)&&n.text==='eval'))file.dynamic=true;
    if(ts.isBinaryExpression(n)&&assignment(n.operatorToken.kind))mutations.push([n.left,scope]);
    if((ts.isPrefixUnaryExpression(n)||ts.isPostfixUnaryExpression(n))&&[ts.SyntaxKind.PlusPlusToken,ts.SyntaxKind.MinusMinusToken].includes(n.operator))mutations.push([n.operand,scope]);
    if(ts.isCallExpression(n)||ts.isNewExpression(n)){pendingCalls.push({file,n,scope,ownerId});if(pendingCalls.length>19000)throw new Error('ATLAS_DEEP_JS_CALL_LIMIT');if(ts.isIdentifier(n.expression)&&n.expression.text==='eval')file.dynamic=true;}
    if(ts.isAwaitExpression(n))pendingAwait.push({file,n,ownerId});
    if(ts.isReturnStatement(n))pendingReturn.push({file,n,ownerId});
    if(ts.isIfStatement(n)||ts.isConditionalExpression(n))pendingConditions.push({file,n,ownerId});
    ts.forEachChild(n,x=>walk(file,x,scope,ownerId,qualified,depth+1));
  }
  for(const f of files.values())if(f.parsed)walk(f,f.ast,f.scope,f.module.id,f.path);
  for(const [n,s] of mutations)mark(n,s);
  const unwrap=e=>{while(ts.isParenthesizedExpression(e)||ts.isAsExpression(e)||ts.isTypeAssertionExpression(e)||ts.isNonNullExpression(e)||ts.isSatisfiesExpression(e))e=e.expression;return e;};
  const unresolved=(reason,status='UNKNOWN')=>({status,reason,targetIds:[]});
  const resolveFile=(from,spec)=>{if(!spec.startsWith('.'))return {external:true};const base=path.posix.normalize(path.posix.join(path.posix.dirname(from.path),spec));if(!validPath(base))return {};const candidates=files.has(base)?[base]:[...['.ts','.tsx','.js','.jsx','.mjs','.cjs'].map(x=>base+x),...['.ts','.tsx','.js','.jsx','.mjs','.cjs'].map(x=>base+'/index'+x)].filter(x=>files.has(x));return candidates.length===1?{file:files.get(candidates[0])}:{ambiguous:candidates.length>1};};
  function resolveBinding(b,at,seen=new Set(),construct=false){
    if(!b)return unresolved('No captured lexical binding; external/global target not established','EXTERNAL');
    if(seen.has(b)||seen.size>64)return unresolved('Cyclic alias or re-export exceeds resolution profile');seen=new Set(seen);seen.add(b);
    if(b.duplicate||b.mutated||b.file.dynamic)return unresolved(b.duplicate?'Duplicate declarations':b.mutated?'Captured assignment can replace this binding':'Dynamic scope/eval makes bindings indeterminate');
    if(!b.scope.parent&&!b.file.moduleScope)return unresolved('Shared-script global namespace is outside the qualified module profile');
    if(b.kind==='type-import')return unresolved('Type-only import/export is not a runtime target');
    if(b.decorated)return unresolved('Decorated declaration has an unknown effective runtime target');
    if(b.kind==='function')return construct?unresolved('Function construction is outside the qualified subset'):{status:'RESOLVED',reason:'Unique lexical function binding with no captured reassignment',targetIds:[b.node.id]};
    if(b.kind==='class'&&at.file===b.file&&ownerByAst.get(b.ast)===at.ownerId&&at.n.getStart()<b.ast.end)return unresolved('Class is referenced before initialization');
    if(b.kind==='class')return !construct?unresolved('Class value used without new'):b.inherits?unresolved('Inherited constructor dispatch is outside the qualified subset'):{status:'RESOLVED',reason:'Unique non-decorated, non-derived class binding for new',targetIds:[b.node.id]};
    if(b.kind==='constant'){
      if(at.file===b.file&&ownerByAst.get(b.ast)===at.ownerId&&at.n.getStart()<b.ast.end)return unresolved('Lexical value is referenced before initialization');
      return resolveExpression(b.initializer,{...at,n:b.initializer,ownerId:ownerByAst.get(b.ast),file:b.file,scope:scopeByAst.get(b.ast)||b.scope},seen,construct);
    }
    if(b.kind==='default-expression')return resolveExpression(b.expression,{...at,file:b.file,scope:b.scope},seen,construct);
    if(b.kind==='import'||b.kind==='export'){
      if(!b.spec)return resolveBinding(find(b.scope,b.imported),at,seen,construct);
      const target=resolveFile(b.file,b.spec);if(target.external)return unresolved('Package dependency is outside captured local sources','EXTERNAL');if(!target.file)return unresolved(target.ambiguous?'Multiple admissible module paths':'Imported module is absent from captured source selection');
      if(!target.file.parsed)return unresolved('Imported source has parse diagnostics');if(b.imported==='*')return unresolved('Namespace value is not directly callable');
      const exp=target.file.exports.get(b.imported);return exp?resolveBinding(exp,at,seen,construct):unresolved('Named export is not established in captured module');
    }
    return unresolved(b.reason||'Parameter, mutable value or unsupported binding cannot establish a target');
  }
  function resolveExpression(expr,at,seen=new Set(),construct=false){
    const e=unwrap(expr);if(ts.isIdentifier(e))return resolveBinding(find(at.scope,e.text),at,seen,construct);
    if(ts.isFunctionExpression(e)||ts.isArrowFunction(e)){const n=nodeByAst.get(e);return n&&!construct?{status:'RESOLVED',reason:'Direct function expression in captured syntax',targetIds:[n.id]}:unresolved('Unsupported expression constructor');}
    if(ts.isPropertyAccessExpression(e)&&ts.isIdentifier(e.expression)){
      const b=find(at.scope,e.expression.text);if(b?.kind==='import'&&b.imported==='*'&&!b.mutated&&!b.duplicate){const target=resolveFile(b.file,b.spec);if(target.file?.parsed)return resolveBinding(target.file.exports.get(e.name.text),at,seen,construct);if(target.external)return unresolved('External namespace target not analyzed','EXTERNAL');}
      return unresolved('Object/property dispatch and possible overrides are not resolved');
    }
    return unresolved(ts.isCallExpression(e)?'Returned callable or dynamic import result is not resolved':'Computed, conditional or dynamic callee is not resolved');
  }
  for(const {file,n,spec,typeOnly} of pendingImports){const target=resolveFile(file,spec);if(target.file)addEdge(file.module.id,target.file.module.id,typeOnly?'TYPE_IMPORTS':'IMPORTS','INFERRED',source(file,n),{resolution:typeOnly?'Type-only source dependency; emitted module side effects UNKNOWN without compiler options':'Unique selected module path; module loading/execution not established'});}
  for(const c of pendingCalls){
    const {file,n,scope,ownerId}=c,expression=n.expression.getText(file.ast).slice(0,500),v=make(file,n,'callsite',expression,ownerId,expression);
    const resolved=file.dynamic?unresolved('Direct eval/with is present; lexical target resolution withheld'):resolveExpression(n.expression,c,new Set(),ts.isNewExpression(n));
    const call={id:v.id,callerId:ownerId,expression,source:v.source,...resolved};callSites.push(call);coverage.callSites++;coverage[call.status.toLowerCase()]++;
    if(call.status==='RESOLVED')addEdge(ownerId,call.targetIds[0],'CALLS','INFERRED',v.source,{callSiteId:v.id,resolution:call.reason,limitations:['Static binding target only; invocation, initialization and reachability are not established.']});
    for(const arg of n.arguments||[]){const e=unwrap(arg);if(ts.isIdentifier(e)){const b=find(scope,e.text);if(b?.node&&!b.duplicate)addEdge(b.node.id,v.id,'PASSES_ARGUMENT','OBSERVED',source(file,arg),{resolution:'Argument syntax references this lexical binding; value and interprocedural transformation are unknown'});}}
  }
  for(const {file,n,ownerId} of pendingAwait){const v=make(file,n,'async-operation','await',ownerId);addEdge(ownerId,v.id,'AWAITS','OBSERVED',v.source,{resolution:'Await syntax only; scheduling and completion not observed'});}
  for(const {file,n,ownerId} of pendingReturn){const v=make(file,n,'return','return',ownerId);addEdge(v.id,ownerId,'RETURNS_TO','OBSERVED',v.source,{resolution:'Syntactic return from this function; execution and value unknown'});}
  for(const {file,n,ownerId} of pendingConditions){const cond=ts.isIfStatement(n)?n.expression:n.condition,v=make(file,cond,'condition',cond.getText(file.ast).slice(0,500),ownerId);addEdge(ownerId,v.id,'BRANCH','OBSERVED',v.source,{resolution:'Syntactic condition; branch reachability and path ordering not established'});}
  return {provider:PROVIDER,nodes,edges,callSites,coverage,capabilities:{syntax:'JavaScript/JSX/TypeScript/TSX via exact TypeScript 5.9.3 parser',calls:'qualified lexical functions, const aliases, direct closures, named/default/namespace ESM imports and explicit named re-exports; simple class construction',typeOnlyImports:'kept out of runtime resolution',async:'syntax only',controlFlow:'conditions only; no complete CFG',dataFlow:'lexical identifier argument and syntactic return relationships only',commonJS:'UNSUPPORTED',runtime:'UNSUPPORTED',externalDependencies:'UNSUPPORTED'},limitations:[
    'Calls are INFERRED static binding identities under initialized captured lexical bindings, not proof of execution, reachability or complete program semantics.',
    'The profile does not model external mutation, hot reload, runtime module loaders, JS shared-script global scope or code injected outside captured sources.',
    'Computed/property dispatch, callbacks, returned callables, mutable variables, decorators, inheritance, export-star, CommonJS and compiler path aliases remain unresolved.',
    'TypeScript compilation variants, emit transforms and type checking are not performed; syntax newer than 5.9.3 can be rejected. Parse-diagnostic files yield no semantic relations.',
    'No target code, tsconfig, dependency loader, plugin or compiler emit is executed. Only supplied captured bytes are parsed.',
    'Conditions, await and returns are syntactic observations; they do not form a complete control-flow or runtime data-flow model.'
  ]};
}
