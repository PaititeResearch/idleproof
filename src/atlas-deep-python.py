#!/usr/bin/env python3
"""Bounded syntax-only Python analysis. Input source is data, never imported/executed."""
from __future__ import annotations
import ast
import hashlib
import json
import platform
import sys
import time
from collections import defaultdict

VERSION = '1'
LIMITS = {'files': 256, 'fileBytes': 262144, 'totalBytes': 4194304,
          'nodes': 24000, 'edges': 48000, 'astNodes': 180000}
FUNCTIONS = (ast.FunctionDef, ast.AsyncFunctionDef)
COMPREHENSIONS = (ast.ListComp, ast.SetComp, ast.DictComp, ast.GeneratorExp)


def uid(prefix, *parts):
    raw = json.dumps(parts, ensure_ascii=True, separators=(',', ':'))
    return prefix + '_' + hashlib.sha256(raw.encode()).hexdigest()[:40]


def label(node):
    try:
        return ast.unparse(node)[:240] or type(node).__name__
    except (RecursionError, ValueError):
        return type(node).__name__


class Scope:
    def __init__(self, node, parent, module, kind, graph_id, name):
        self.node, self.parent, self.module, self.kind = node, parent, module, kind
        self.id, self.name = graph_id, name
        self.bindings = defaultdict(list)
        self.globals, self.nonlocals = set(), set()
        self.conditional = False


class Analyzer:
    def __init__(self, payload):
        self.identity = payload['identity']
        self.files = sorted((f for f in payload['files'] if f['path'].endswith('.py')), key=lambda f: f['path'])
        self.nodes, self.edges, self.calls = {}, {}, []
        self.modules, self.scopes, self.scope_of, self.node_scope = defaultdict(list), [], {}, {}
        self.defs, self.function_params, self.variable_ids = {}, {}, {}
        self.ast_files, self.file_of = [], {}
        self.mutated_attributes, self.dynamic_modules = set(), set()
        self.global_writes = set()
        self.coverage = {'files': len(self.files), 'parsedFiles': 0, 'syntaxErrors': [], 'astNodes': 0,
                         'unresolvedCalls': 0, 'resolvedCalls': 0, 'ambiguousCalls': 0, 'externalCalls': 0,
                         'unsupportedControlStatements': 0, 'truncated': False,
                         'semanticCompleteness': 'UNKNOWN'}

    def source(self, node, file):
        line = getattr(node, 'lineno', 1)
        end = getattr(node, 'end_lineno', line) or line
        return {'snapshotId': self.identity['snapshotId'], 'path': file['path'],
                'sourceSha256': file['sourceSha256'], 'line': line, 'endLine': end,
                'column': getattr(node, 'col_offset', 0), 'endColumn': getattr(node, 'end_col_offset', 0) or 0,
                'language': 'python', 'provider': 'python-ast', 'providerVersion': VERSION}

    def add_node(self, kind, name, syntax, file, scope=None, **extra):
        source = self.source(syntax, file)
        ident = uid('py', self.identity['snapshotId'], file['path'], file['sourceSha256'],
                    kind, name, source['line'], source['column'], source['endLine'], source['endColumn'],
                    scope.id if scope else None)
        if ident not in self.nodes:
            if len(self.nodes) >= LIMITS['nodes']:
                raise ValueError('ATLAS_DEEP_PYTHON_GRAPH_LIMIT')
            self.nodes[ident] = {'id': ident, 'kind': kind, 'label': name[:4096] or kind,
                                'qualifiedName': name[:4096], 'path': file['path'], 'authority': 'OBSERVED',
                                'source': source, **({'scope': scope.id} if scope else {}), **extra}
        return ident

    def edge(self, kind, origin, target, syntax, file, authority='OBSERVED', **extra):
        if not origin or not target:
            return
        source = self.source(syntax, file)
        ident = uid('pye', kind, origin, target, source, extra)
        if len(self.edges) >= LIMITS['edges'] and ident not in self.edges:
            raise ValueError('ATLAS_DEEP_PYTHON_GRAPH_LIMIT')
        self.edges[ident] = {'id': ident, 'from': origin, 'to': target, 'kind': kind,
                             'authority': authority, 'source': source,
                             'resolution': extra.pop('resolution', 'captured-python-syntax'), **extra}

    @staticmethod
    def module_name(path):
        parts = path[:-3].split('/')
        if parts[-1] == '__init__':
            parts.pop()
        if any(not part.isidentifier() for part in parts):
            return '<file:' + path + '>'
        return '.'.join(parts)

    def bind(self, scope, name, kind, node, value=None, conditional=False):
        scope.bindings[name].append({'kind': kind, 'node': node, 'value': value, 'conditional': conditional})

    def collect(self, node, scope, file, conditional=False):
        self.scope_of[id(node)] = scope
        self.file_of[id(node)] = file
        if isinstance(node, FUNCTIONS + (ast.ClassDef, ast.Lambda)):
            is_lambda = isinstance(node, ast.Lambda)
            name = '<lambda>' if is_lambda else node.name
            qualified = scope.name + '.' + name
            kind = 'lambda' if is_lambda else 'class' if isinstance(node, ast.ClassDef) else 'method' if scope.kind == 'class' else 'async-function' if isinstance(node, ast.AsyncFunctionDef) else 'function'
            graph_id = self.add_node(kind, qualified, node, file, scope)
            self.defs[graph_id] = (node, scope, file)
            self.edge('DEFINES', scope.id, graph_id, node, file)
            if not is_lambda:
                self.bind(scope, name, 'definition', node, graph_id, conditional)
            child = Scope(node, scope, scope.module, 'class' if kind == 'class' else 'function', graph_id, qualified)
            child.conditional = conditional
            self.scopes.append(child)
            self.node_scope[id(node)] = child
            # Decorators, defaults, bases and annotations execute in the enclosing scope.
            for decorator in getattr(node, 'decorator_list', []):
                self.collect(decorator, scope, file, conditional)
            if isinstance(node, ast.ClassDef):
                for expr in node.bases + [kw.value for kw in node.keywords]:
                    self.collect(expr, scope, file, conditional)
                for stmt in node.body:
                    self.collect(stmt, child, file)
            else:
                args = node.args
                params = args.posonlyargs + args.args + args.kwonlyargs + ([args.vararg] if args.vararg else []) + ([args.kwarg] if args.kwarg else [])
                self.function_params[graph_id] = []
                for param in params:
                    self.bind(child, param.arg, 'parameter', param)
                    self.scope_of[id(param)] = child
                    self.file_of[id(param)] = file
                    pid = self.add_node('parameter', qualified + '.' + param.arg, param, file, child)
                    self.variable_ids[(child.id, param.arg)] = pid
                    self.function_params[graph_id].append((param.arg, pid))
                    self.edge('DEFINES', graph_id, pid, param, file)
                    if param.annotation:
                        self.collect(param.annotation, scope, file, conditional)
                for expr in args.defaults + [d for d in args.kw_defaults if d is not None]:
                    self.collect(expr, scope, file, conditional)
                if getattr(node, 'returns', None):
                    self.collect(node.returns, scope, file, conditional)
                if is_lambda:
                    self.collect(node.body, child, file)
                else:
                    for stmt in node.body:
                        self.collect(stmt, child, file)
            return
        if isinstance(node, COMPREHENSIONS):
            graph_id = self.add_node('closure', scope.name + '.<comprehension>', node, file, scope)
            child = Scope(node, scope, scope.module, 'comprehension', graph_id, scope.name + '.<comprehension>')
            self.scopes.append(child)
            self.node_scope[id(node)] = child
            for i, gen in enumerate(node.generators):
                self.collect(gen.iter, scope if i == 0 else child, file, conditional)
                for target in ast.walk(gen.target):
                    if isinstance(target, ast.Name):
                        self.bind(child, target.id, 'unknown', target, conditional=True)
                self.collect(gen.target, child, file, True)
                for expr in gen.ifs:
                    self.collect(expr, child, file, True)
            if isinstance(node, ast.DictComp):
                self.collect(node.key, child, file, True)
                self.collect(node.value, child, file, True)
            else:
                self.collect(node.elt, child, file, True)
            return
        if isinstance(node, ast.Global):
            scope.globals.update(node.names)
            self.global_writes.update((scope.module.name, name) for name in node.names)
        if isinstance(node, ast.Nonlocal):
            scope.nonlocals.update(node.names)
            # Any nonlocal rebinding invalidates that spelling throughout the module.
            self.global_writes.update((scope.module.name, name) for name in node.names)
        if isinstance(node, ast.Import):
            for alias in node.names:
                self.bind(scope, alias.asname or alias.name.split('.')[0], 'module-import', node,
                          (alias.name if alias.asname else alias.name.split('.')[0], alias.name), conditional)
        if isinstance(node, ast.ImportFrom):
            if node.module in {'builtins', 'importlib'} and any(a.name in {'*', 'exec', 'eval', 'globals', 'locals', 'vars', '__import__', 'setattr', 'delattr', 'import_module', 'reload'} for a in node.names):
                self.dynamic_modules.add(scope.module.name)
            module = node.module or ''
            if node.level:
                package = scope.module.name.split('.')
                if not scope.module.file['path'].endswith('/__init__.py'):
                    package = package[:-1]
                if node.level > len(package):
                    module = '<invalid-relative-import>'
                else:
                    module = '.'.join(package[:len(package) - node.level + 1] + ([module] if module else []))
            for alias in node.names:
                if alias.name == '*':
                    self.dynamic_modules.add(scope.module.name)
                else:
                    self.bind(scope, alias.asname or alias.name, 'from-import', node, (module, alias.name), conditional)
        if isinstance(node, (ast.Assign, ast.AnnAssign)):
            value = node.value
            targets = node.targets if isinstance(node, ast.Assign) else [node.target]
            for target in targets:
                if isinstance(target, ast.Name):
                    self.bind(scope, target.id, 'alias' if isinstance(value, (ast.Name, ast.Attribute, ast.Lambda)) else 'value', target, value, conditional)
                else:
                    for item in ast.walk(target):
                        if isinstance(item, ast.Name) and isinstance(item.ctx, ast.Store):
                            self.bind(scope, item.id, 'unknown', item, conditional=conditional)
                if isinstance(target, (ast.Attribute, ast.Subscript)):
                    self.mark_mutation(target, scope)
            if value is not None:
                self.collect(value, scope, file, conditional)
            for target in targets:
                self.annotate_target(target, scope, file)
            if isinstance(node, ast.AnnAssign) and node.annotation:
                self.collect(node.annotation, scope, file, conditional)
            return
        if isinstance(node, ast.NamedExpr):
            self.global_writes.add((scope.module.name, node.target.id))
        if isinstance(node, (ast.AugAssign, ast.Delete)):
            targets = node.targets if isinstance(node, ast.Delete) else [node.target]
            for target in targets:
                if isinstance(target, ast.Name):
                    self.bind(scope, target.id, 'unknown', target, conditional=conditional)
                else:
                    self.mark_mutation(target, scope)
        if isinstance(node, (ast.For, ast.AsyncFor)):
            for target in ast.walk(node.target):
                if isinstance(target, ast.Name):
                    self.bind(scope, target.id, 'unknown', target, conditional=True)
        if isinstance(node, (ast.With, ast.AsyncWith)):
            for item in node.items:
                if item.optional_vars:
                    for target in ast.walk(item.optional_vars):
                        if isinstance(target, ast.Name):
                            self.bind(scope, target.id, 'unknown', target, conditional=True)
        if isinstance(node, ast.ExceptHandler) and node.name:
            self.bind(scope, node.name, 'unknown', node, conditional=True)
        if isinstance(node, (ast.MatchAs, ast.MatchStar)) and node.name:
            self.bind(scope, node.name, 'unknown', node, conditional=True)
        if isinstance(node, ast.MatchMapping) and node.rest:
            self.bind(scope, node.rest, 'unknown', node, conditional=True)
        if isinstance(node, ast.Call):
            if isinstance(node.func, ast.Name) and node.func.id in {'exec', 'eval', 'globals', 'locals', 'vars', '__import__', 'setattr', 'delattr'}:
                self.dynamic_modules.add(scope.module.name)
            if isinstance(node.func, ast.Attribute) and node.func.attr in {'import_module', 'exec_module', 'exec', 'eval', 'globals', 'locals', 'vars', '__import__', 'setattr', 'delattr'}:
                self.dynamic_modules.add(scope.module.name)
        if isinstance(node, ast.Name) and isinstance(node.ctx, ast.Load) and node.id in {'exec', 'eval', 'globals', 'locals', 'vars', '__import__', 'setattr', 'delattr'}:
            # Referencing a reflective builtin can export it through an alias.
            # Do not wait for a direct spelling at the eventual call site.
            self.dynamic_modules.add(scope.module.name)
        branch = conditional or isinstance(node, (ast.If, ast.IfExp, ast.For, ast.AsyncFor, ast.While, ast.Try, ast.Match, ast.ExceptHandler))
        if hasattr(ast, 'TryStar') and isinstance(node, ast.TryStar):
            branch = True
        for child in ast.iter_child_nodes(node):
            self.collect(child, scope, file, branch)

    def annotate_target(self, node, scope, file):
        self.scope_of[id(node)] = scope
        self.file_of[id(node)] = file
        for child in ast.iter_child_nodes(node):
            self.annotate_target(child, scope, file)

    def mark_mutation(self, target, scope):
        if isinstance(target, ast.Attribute):
            self.mutated_attributes.add(target.attr)
        else:
            self.dynamic_modules.add(scope.module.name)

    def lexical_scope(self, scope, name):
        current = scope
        while current:
            if name in current.globals or name in current.nonlocals:
                return current, [{'kind': 'unknown', 'conditional': False}]
            if name in current.bindings:
                return current, current.bindings[name]
            current = current.parent
            while current and current.kind == 'class':
                current = current.parent
        return None, []

    @staticmethod
    def unknown(reason, candidates=()):
        return {'kind': 'unknown', 'reason': reason, 'targets': list(dict.fromkeys(candidates))}

    def definition(self, ident):
        node, owner, _ = self.defs[ident]
        if isinstance(node, ast.ClassDef):
            if node.decorator_list or node.keywords or node.bases:
                return self.unknown('Class decorators, bases or metaclass may alter the effective class binding.', [ident])
            return {'kind': 'class', 'id': ident, 'reason': 'Unique captured class binding; constructor dispatch is not resolved.'}
        decorators = node.decorator_list if hasattr(node, 'decorator_list') else []
        if decorators:
            safe = owner.kind == 'class' and len(decorators) == 1 and isinstance(decorators[0], ast.Name) and decorators[0].id in {'staticmethod', 'classmethod'}
            if safe:
                _, bindings = self.lexical_scope(owner, decorators[0].id)
                safe = not bindings
            if not safe:
                return self.unknown('Decorator may replace the function; syntactic definition is only a possible target.', [ident])
        return {'kind': 'function', 'id': ident, 'reason': 'Unique captured function binding in lexical scope.'}

    def resolve(self, expr, scope, seen=None):
        seen = set() if seen is None else set(seen)
        key = (scope.id, id(expr))
        if key in seen or len(seen) > 48:
            return self.unknown('Cyclic or excessive alias/import chain.')
        seen.add(key)
        if isinstance(expr, ast.Lambda):
            child = self.node_scope.get(id(expr))
            return {'kind': 'function', 'id': child.id, 'reason': 'Literal lambda binding.'} if child else self.unknown('Lambda unavailable.')
        if isinstance(expr, ast.Name):
            owner, bindings = self.lexical_scope(scope, expr.id)
            if (scope.module.name, expr.id) in self.global_writes:
                return self.unknown('Global/nonlocal/dynamic assignment invalidates the name binding.')
            if owner and owner.module.name in self.dynamic_modules:
                return self.unknown('Reflection, wildcard import or dynamic namespace mutation in module.')
            if not bindings:
                return {'kind': 'external', 'reason': 'No captured lexical binding; builtin or unavailable external target.'}
            candidates = [b['value'] for b in bindings if b['kind'] == 'definition']
            if len(bindings) != 1 or bindings[0]['conditional']:
                return self.unknown('Multiple, reassigned or conditional lexical bindings.', candidates)
            binding = bindings[0]
            kind, value = binding['kind'], binding.get('value')
            if kind in {'definition', 'module-import', 'from-import'} and (owner is scope or scope.kind in {'module', 'class'}):
                position = (getattr(expr, 'lineno', 0), getattr(expr, 'col_offset', 0))
                initialized = (getattr(binding['node'], 'end_lineno', getattr(binding['node'], 'lineno', 0)), getattr(binding['node'], 'end_col_offset', 0))
                if position <= initialized:
                    return self.unknown('Name is used before its declaration/import has completed in this executing scope.')
            if kind == 'definition':
                # At module/class execution, a definition appearing later has not yet bound the name.
                if scope.kind in {'module', 'class'} and getattr(expr, 'lineno', 0) < getattr(binding['node'], 'lineno', 0):
                    return self.unknown('Call precedes the definition in the executing scope.')
                return self.definition(value)
            if kind == 'alias':
                if getattr(binding['node'], 'lineno', 0) > getattr(expr, 'lineno', 0) and scope == owner:
                    return self.unknown('Alias is not yet initialized at this source position.')
                resolved = self.resolve(value, owner, seen)
                if resolved['kind'] not in {'unknown', 'external'}:
                    resolved = {**resolved, 'reason': 'Unique unmodified alias; ' + resolved['reason']}
                return resolved
            if kind == 'module-import':
                mod, imported = value
                return {'kind': 'module', 'module': mod, 'imported': imported, 'reason': 'Explicit static module import.'}
            if kind == 'from-import':
                module, name = value
                return self.module_member(module, name, seen)
            return self.unknown('Parameter, local value or unsupported assignment shadows any outer callable.')
        if isinstance(expr, ast.Attribute):
            if expr.attr in self.mutated_attributes:
                return self.unknown('Captured attribute mutation makes this spelling unsafe to resolve.')
            base = self.resolve(expr.value, scope, seen)
            if base['kind'] == 'module':
                combined = base['module'] + '.' + expr.attr
                imported = base.get('imported', '')
                if combined in self.modules and (imported == combined or imported.startswith(combined + '.')):
                    return {'kind': 'module', 'module': combined, 'imported': imported, 'reason': 'Explicit static submodule import.'}
                return self.module_member(base['module'], expr.attr, seen)
            if base['kind'] == 'class':
                class_node, _, _ = self.defs[base['id']]
                cls_scope = self.node_scope[id(class_node)]
                if class_node.bases or class_node.keywords or class_node.decorator_list:
                    return self.unknown('Inheritance/metaclass/decorated class dispatch is not qualified.')
                if any(name in cls_scope.bindings for name in {'__getattribute__', '__getattr__', '__new__'}):
                    return self.unknown('Custom class dispatch is not qualified.')
                bindings = cls_scope.bindings.get(expr.attr, [])
                if len(bindings) != 1 or bindings[0]['kind'] != 'definition' or bindings[0]['conditional']:
                    return self.unknown('Class attribute is missing, rebound or not a unique method.')
                result = self.definition(bindings[0]['value'])
                return {**result, 'reason': 'Direct attribute on a captured plain class; ' + result['reason']}
            return self.unknown('Instance, polymorphic, computed or unavailable attribute dispatch is not qualified.', base.get('targets', []))
        return self.unknown('Dynamic call expression, returned callable or higher-order dispatch is not qualified.')

    def module_member(self, module, name, seen):
        modules = self.modules.get(module, [])
        if not modules:
            return {'kind': 'external', 'reason': 'Imported module is outside the captured Python selection.'}
        if len(modules) != 1:
            return self.unknown('Multiple captured paths have this module identity.')
        target = modules[0]
        if name in self.mutated_attributes or target.name in self.dynamic_modules:
            return self.unknown('Module export may be dynamically modified.')
        # Attribute lookup uses the imported module's namespace, never the caller namespace.
        fake = ast.Name(id=name, ctx=ast.Load())
        fake.lineno = 1000000000
        result = self.resolve(fake, target, seen)
        if result['kind'] == 'external':
            return self.unknown('Imported name is not a captured export; package side effects are not inferred.')
        return {**result, 'reason': 'Explicit import and unique captured module export; ' + result['reason']}

    def variable(self, scope, name, syntax, file):
        owner, bindings = self.lexical_scope(scope, name)
        if not owner:
            return None, None
        if name in owner.globals or name in owner.nonlocals:
            return None, None
        key = (owner.id, name)
        if key not in self.variable_ids:
            origin = bindings[0].get('node', syntax)
            origin_file = owner.module.file
            self.variable_ids[key] = self.add_node('variable', owner.name + '.' + name, origin, origin_file, owner,
                                                  meaning='Lexical binding; not a reaching definition or runtime value.')
        return self.variable_ids[key], owner

    def analyze_calls(self):
        for tree, file, module in self.ast_files:
            for syntax in ast.walk(tree):
                if not isinstance(syntax, ast.Call):
                    continue
                scope = self.scope_of[id(syntax)]
                call_id = self.add_node('callsite', label(syntax.func) + '(…)', syntax, file, scope)
                self.edge('DEFINES', scope.id, call_id, syntax, file)
                result = self.resolve(syntax.func, scope)
                kind = result['kind']
                if kind in {'function', 'class'}:
                    status, targets = 'RESOLVED', [result['id']]
                elif kind == 'external':
                    status, targets = 'EXTERNAL', []
                else:
                    targets = result.get('targets', [])
                    status = 'AMBIGUOUS' if targets else 'UNKNOWN'
                call = {'id': call_id, 'callerId': scope.id, 'expression': label(syntax.func),
                        'source': self.source(syntax, file), 'status': status, 'targetIds': targets,
                        'reason': result['reason']}
                self.calls.append(call)
                metric = {'RESOLVED': 'resolvedCalls', 'AMBIGUOUS': 'ambiguousCalls', 'UNKNOWN': 'unresolvedCalls', 'EXTERNAL': 'externalCalls'}[status]
                self.coverage[metric] += 1
                for target in targets:
                    self.edge('CALLS' if status == 'RESOLVED' else 'MAY_CALL', scope.id, target, syntax, file,
                              'INFERRED' if status == 'RESOLVED' else 'POSSIBLE', callSiteId=call_id,
                              resolution=result['reason'], targetBindingKind=kind,
                              limitations=['Static binding under captured-code assumptions; no execution or universal reachability claim.'])
                # Explicit argument expression -> formal parameter; unsupported argument expansion stays absent.
                if status == 'RESOLVED' and kind == 'function':
                    self.argument_flow(syntax, scope, file, call_id, targets[0])

    def argument_flow(self, call, scope, file, call_id, target):
        fn, owner, _ = self.defs[target]
        if not isinstance(fn, FUNCTIONS + (ast.Lambda,)):
            return
        args = fn.args
        if any(isinstance(a, ast.Starred) for a in call.args) or any(k.arg is None for k in call.keywords):
            return
        # Method binding/injected cls is not included in the initial flow contract.
        if owner.kind == 'class':
            return
        positional = args.posonlyargs + args.args
        if len(call.args) > len(positional) and args.vararg is None:
            return
        params = dict(self.function_params[target])
        pairs = [(expr, positional[i].arg) for i, expr in enumerate(call.args[:len(positional)])]
        pairs += [(kw.value, kw.arg) for kw in call.keywords if kw.arg in params and kw.arg not in {a.arg for a in args.posonlyargs}]
        supplied = [name for _, name in pairs]
        if len(supplied) != len(set(supplied)):
            return
        for index, (expr, name) in enumerate(pairs):
            aid = self.add_node('argument', 'argument ' + name + ': ' + label(expr), expr, file, scope, callSiteId=call_id)
            self.edge('PASSES_ARGUMENT', aid, params[name], expr, file, 'INFERRED',
                      callSiteId=call_id, resolution='Explicit positional/keyword syntax mapped to a resolved Python formal; conditional on invocation.')
            self.read_flow(aid, expr, scope, file)

    def read_flow(self, owner_id, expr, scope, file):
        for syntax in ast.walk(expr):
            if isinstance(syntax, ast.Name) and isinstance(syntax.ctx, ast.Load) and self.scope_of.get(id(syntax)) is scope:
                target, target_scope = self.variable(scope, syntax.id, syntax, file)
                if target:
                    self.edge('READS', owner_id, target, syntax, file, 'INFERRED', resolution='Lexical name reference; value and reaching assignment are not established.')
                    if target_scope is not scope and target_scope.kind == 'function':
                        self.edge('CAPTURES', scope.id, target, syntax, file, 'INFERRED', resolution='Free lexical reference to enclosing function binding.')

    def statements(self, body, scope, file, continuation=None, loop=None):
        """Build syntax-level normal-flow only. Exceptions/complex constructs stay explicit gaps."""
        next_id = continuation
        for statement in reversed(body):
            if isinstance(statement, FUNCTIONS + (ast.ClassDef,)):
                sid = self.node_scope[id(statement)].id
            else:
                kind = 'condition' if isinstance(statement, (ast.If, ast.While, ast.For, ast.AsyncFor)) else 'return' if isinstance(statement, ast.Return) else 'exception' if isinstance(statement, ast.Raise) else 'async-operation' if isinstance(statement, ast.AsyncWith) else 'statement'
                sid = self.add_node(kind, label(statement)[:240], statement, file, scope)
            if isinstance(statement, ast.If):
                yes = self.statements(statement.body, scope, file, next_id, loop)
                no = self.statements(statement.orelse, scope, file, next_id, loop)
                self.edge('CONTROL_FLOW', sid, yes, statement.test, file, 'INFERRED', branch='true', resolution='Syntactic conditional branch; feasibility not established.')
                self.edge('CONTROL_FLOW', sid, no, statement.test, file, 'INFERRED', branch='false', resolution='Syntactic conditional branch; feasibility not established.')
                self.read_flow(sid, statement.test, scope, file)
            elif isinstance(statement, (ast.While, ast.For, ast.AsyncFor)):
                exit_id = self.statements(statement.orelse, scope, file, next_id, loop)
                entered = self.statements(statement.body, scope, file, sid, (next_id, sid))
                self.edge('CONTROL_FLOW', sid, entered, statement, file, 'INFERRED', branch='loop-body', resolution='Syntactic loop body; iteration count unknown.')
                self.edge('CONTROL_FLOW', sid, exit_id, statement, file, 'INFERRED', branch='loop-exhausted', resolution='Syntactic normal loop exit; exceptions omitted.')
                self.read_flow(sid, statement.test if isinstance(statement, ast.While) else statement.iter, scope, file)
            elif isinstance(statement, ast.Break):
                self.edge('CONTROL_FLOW', sid, loop[0] if loop else None, statement, file, 'INFERRED', branch='break')
            elif isinstance(statement, ast.Continue):
                self.edge('CONTROL_FLOW', sid, loop[1] if loop else None, statement, file, 'INFERRED', branch='continue')
            elif isinstance(statement, (ast.Return, ast.Raise)):
                if isinstance(statement, ast.Return) and statement.value:
                    self.read_flow(sid, statement.value, scope, file)
                if isinstance(statement, ast.Raise):
                    self.edge('THROWS', scope.id, sid, statement, file, resolution='Explicit raise syntax; exception target/value not inferred.')
            elif isinstance(statement, (ast.Try, ast.With, ast.AsyncWith, ast.Match)) or (hasattr(ast, 'TryStar') and isinstance(statement, ast.TryStar)):
                self.coverage['unsupportedControlStatements'] += 1
                self.nodes[sid]['controlStatus'] = 'UNSUPPORTED'
                self.edge('CONTROL_FLOW', sid, next_id, statement, file, 'POSSIBLE', branch='unknown-continuation', resolution='Complex control construct is an explicit gap; this is only a possible continuation.')
            else:
                self.edge('CONTROL_FLOW', sid, next_id, statement, file, 'INFERRED', branch='normal', resolution='Syntactic next statement on normal completion; implicit exceptions omitted.')
                if isinstance(statement, (ast.Assign, ast.AnnAssign, ast.AugAssign)):
                    targets = statement.targets if isinstance(statement, ast.Assign) else [statement.target]
                    for target in targets:
                        for name in ast.walk(target):
                            if isinstance(name, ast.Name) and isinstance(name.ctx, ast.Store):
                                vid, _ = self.variable(scope, name.id, name, file)
                                self.edge('WRITES', sid, vid, name, file, 'INFERRED', resolution='Syntactic write to lexical binding; no reaching-definition claim.')
                    if statement.value:
                        self.read_flow(sid, statement.value, scope, file)
                elif isinstance(statement, ast.Expr):
                    self.read_flow(sid, statement.value, scope, file)
            if isinstance(statement, ast.Expr) and isinstance(statement.value, ast.Await):
                aid = self.add_node('async-operation', 'await ' + label(statement.value.value), statement.value, file, scope)
                self.edge('AWAITS', scope.id, aid, statement.value, file, resolution='Explicit await syntax; scheduling is unknown.')
            next_id = sid
        return next_id

    def run(self):
        for file in self.files:
            try:
                tree = ast.parse(file['content'], filename=file['path'], type_comments=True)
                count = sum(1 for _ in ast.walk(tree))
                self.coverage['astNodes'] += count
                if self.coverage['astNodes'] > LIMITS['astNodes']:
                    raise ValueError('ATLAS_DEEP_PYTHON_AST_LIMIT')
            except (SyntaxError, RecursionError, MemoryError) as error:
                self.coverage['syntaxErrors'].append({'path': file['path'], 'status': 'UNSUPPORTED', 'reason': type(error).__name__, 'line': getattr(error, 'lineno', None)})
                continue
            name = self.module_name(file['path'])
            mid = self.add_node('module', name or file['path'], tree, file)
            scope = Scope(tree, None, None, 'module', mid, name)
            scope.module, scope.file = scope, file
            self.modules[name].append(scope)
            self.scopes.append(scope)
            self.ast_files.append((tree, file, scope))
            self.coverage['parsedFiles'] += 1
        for tree, file, scope in self.ast_files:
            self.collect(tree, scope, file)
        self.analyze_calls()
        for scope in self.scopes:
            node, file = scope.node, scope.module.file
            if isinstance(node, (ast.Module, ast.FunctionDef, ast.AsyncFunctionDef)):
                entry = self.statements(node.body, scope, file)
                self.edge('CONTROL_FLOW', scope.id, entry, node if not isinstance(node, ast.Module) else node.body[0] if node.body else node, file, 'INFERRED', branch='entry', resolution='Syntactic entry; execution/reachability not established.')
            if isinstance(node, ast.ClassDef):
                for base in node.bases:
                    result = self.resolve(base, scope.parent)
                    if result['kind'] == 'class':
                        self.edge('INHERITS', scope.id, result['id'], base, file, 'INFERRED', resolution='Explicit captured class base binding; MRO/method dispatch not qualified.')
        self.coverage['callSites'] = len(self.calls)
        self.coverage['complete'] = False
        return {'provider': {'name': 'python-ast', 'version': VERSION, 'runtime': platform.python_version()},
                'nodes': sorted(self.nodes.values(), key=lambda n: n['id']),
                'edges': sorted(self.edges.values(), key=lambda e: e['id']),
                'callSites': sorted(self.calls, key=lambda c: c['id']), 'coverage': self.coverage,
                'capabilities': {'lexicalCalls': 'SUPPORTED_CONSERVATIVE', 'staticImports': 'SUPPORTED_CONSERVATIVE',
                    'aliases': 'UNIQUE_UNMODIFIED_ONLY', 'closures': 'LEXICAL_ONLY', 'classCalls': 'BINDING_ONLY',
                    'classMethods': 'PLAIN_DIRECT_CLASS_ONLY', 'instanceDispatch': 'UNSUPPORTED',
                    'inheritance': 'BASE_BINDING_ONLY', 'controlFlow': 'NORMAL_SYNTAX_PARTIAL',
                    'dataFlow': 'LEXICAL_READ_WRITE_ARGUMENTS_ONLY', 'runtime': 'NOT_RUN'},
                'limitations': [
                    'Static resolution assumes ordinary Python lexical/module binding within captured sources; external monkey patching and custom import hooks are not established.',
                    'Imports use exact captured dotted paths, without sys.path guesses, dependency installation, target imports or execution. Source roots such as src/ are not inferred.',
                    'Decorated/rebound/conditional names, reflection, wildcard imports, instance dispatch, returned callables and higher-order calls remain possible or unknown.',
                    'Class CALLS establishes the class binding only; it does not resolve metaclass construction, __new__ or __init__ execution.',
                    'CONTROL_FLOW is syntax-level normal completion, not reachability: implicit exceptions, try/finally, context managers and match remain gaps.',
                    'READS/WRITES are lexical references, not reaching definitions. PASSES_ARGUMENT is explicit syntax mapped to a formal, not a runtime value or taint proof.',
                    'No claim of semantic completeness, execution, causal Proof or analysis of unselected files.'],
                'status': 'PARTIAL' if self.coverage['syntaxErrors'] else 'READY'}


def main():
    raw = sys.stdin.buffer.read(8 * 1024 * 1024 + 1)
    if len(raw) > 8 * 1024 * 1024:
        raise ValueError('ATLAS_DEEP_PYTHON_INPUT_LIMIT')
    payload = json.loads(raw)
    if not isinstance(payload, dict) or not isinstance(payload.get('identity'), dict) or not isinstance(payload.get('files'), list):
        raise ValueError('ATLAS_DEEP_PYTHON_INPUT_INVALID')
    if len(payload['files']) > LIMITS['files']:
        raise ValueError('ATLAS_DEEP_PYTHON_INPUT_LIMIT')
    seen, total = set(), 0
    for file in payload['files']:
        if not isinstance(file, dict) or not isinstance(file.get('path'), str) or not isinstance(file.get('content'), str):
            raise ValueError('ATLAS_DEEP_PYTHON_INPUT_INVALID')
        path = file['path']
        if not path or len(path) > 4096 or any(x in path for x in ('\\', ':', '\0')) or any(x in ('', '.', '..') for x in path.split('/')) or path in seen:
            raise ValueError('ATLAS_DEEP_PYTHON_PATH_INVALID')
        seen.add(path)
        data = file['content'].encode('utf-8')
        total += len(data)
        if len(data) > LIMITS['fileBytes'] or total > LIMITS['totalBytes']:
            raise ValueError('ATLAS_DEEP_PYTHON_INPUT_LIMIT')
        if hashlib.sha256(data).hexdigest() != file.get('sourceSha256'):
            raise ValueError('ATLAS_DEEP_PYTHON_SOURCE_MISMATCH')
    wall, cpu = time.monotonic(), time.process_time()
    result = Analyzer(payload).run()
    result['metrics'] = {'wallMs': (time.monotonic() - wall) * 1000, 'cpuMs': (time.process_time() - cpu) * 1000,
                         'peakRssBytes': None, 'measurement': 'provider process wall/CPU; RSS unavailable on some platforms'}
    try:
        import resource
        result['metrics']['peakRssBytes'] = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss * (1 if sys.platform == 'darwin' else 1024)
    except ImportError:
        pass
    print(json.dumps(result, ensure_ascii=True, separators=(',', ':')))


if __name__ == '__main__':
    try:
        main()
    except (ValueError, KeyError, TypeError, RecursionError, MemoryError) as error:
        code = str(error) if isinstance(error, ValueError) and str(error).startswith('ATLAS_DEEP_PYTHON_') else 'ATLAS_DEEP_PYTHON_ANALYSIS_UNAVAILABLE'
        print(json.dumps({'error': code}, separators=(',', ':')))
        sys.exit(2)
