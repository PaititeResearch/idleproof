#!/usr/bin/env python3
"""Bounded, execution-free JSON/TOML key inventory for Atlas Deep.

Only stdin is read. Target files are never opened/imported. Parsed values and
parser diagnostic text are never retained in the result.
"""

import hashlib
import json
import re
import sys

try:
    import tomllib
except ImportError:
    tomllib = None


PROVIDER = {"name": "data-stdlib", "version": "1"}
MAX_INPUT_BYTES = 4 * 1024 * 1024
MAX_FILE_BYTES = 256 * 1024
MAX_FILES = 256
MAX_NODES = 4096
MAX_NODE_BYTES = 2 * 1024 * 1024
MAX_OUTPUT_BYTES = 4 * 1024 * 1024
MAX_DEPTH = 64
MAX_KEY_BYTES = 512
MAX_POINTER_BYTES = 2048
HASH = re.compile(r"^[a-f0-9]{64}$")


class InvalidData(ValueError):
    """A fixed diagnostic code, never a copied parser message."""


def object_pairs(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise InvalidData("DUPLICATE_JSON_KEY")
        result[key] = value
    return result


def invalid_constant(_value):
    raise InvalidData("NONSTANDARD_JSON_NUMBER")


def strict_json(content):
    return json.loads(content, object_pairs_hook=object_pairs,
                      parse_constant=invalid_constant)


def encode(value):
    # ASCII escaping also makes lone surrogate key names transport-safe.
    return json.dumps(value, sort_keys=True, ensure_ascii=True,
                      separators=(",", ":")).encode("ascii")


def safe_path(path):
    return (isinstance(path, str) and 0 < len(path) <= 1024
            and not re.search(r"[\\:\x00-\x1f\x7f]", path)
            and all(part and part not in (".", "..") for part in path.split("/")))


def language_for(path):
    extension = path.rsplit(".", 1)[-1].lower()
    return {"json": "json", "toml": "toml", "sql": "sql",
            "yaml": "yaml", "yml": "yaml"}.get(extension, "unknown")


def result_template():
    return {
        "provider": PROVIDER,
        "nodes": [], "edges": [], "callSites": [],
        "capabilities": {
            "jsonCompleteDocumentParse": "SUPPORTED",
            "tomlCompleteDocumentParse": "SUPPORTED" if tomllib else "UNSUPPORTED",
            "keyInventory": "BOUNDED", "sectionInventory": "PARSED_OBJECTS_ONLY",
            "exactKeyCoordinates": "UNSUPPORTED", "sqlIndependentValidation": "UNSUPPORTED",
            "yamlIndependentValidation": "UNSUPPORTED", "crossLanguageRelations": "UNSUPPORTED",
            "runtimeState": "UNSUPPORTED", "retainedValues": False,
        },
        "coverage": {
            "inputFiles": 0, "parsedFiles": 0, "unsupportedFiles": 0,
            "invalidFiles": 0, "truncatedFiles": 0, "retainedNodes": 0,
            "omittedNodes": 0, "omittedContainers": 0,
            "complete": False, "semanticCompleteness": "UNKNOWN", "files": [],
        },
        "limitations": [
            "Only JSON and available-stdlib TOML documents are independently parsed.",
            "Nodes describe parsed keys and objects; values are never retained.",
            "Section nodes do not assert that an explicit section header exists.",
            "Every source reference is a file-opening anchor, not an exact key location.",
            "SQL and YAML are explicitly unsupported; Core observations are not independently verified here.",
            "No key name establishes a cross-file dependency, runtime effect, or Proof.",
        ],
    }


def analyze(request):
    if not isinstance(request, dict) or not isinstance(request.get("identity"), dict):
        raise InvalidData("INVALID_REQUEST_IDENTITY")
    identity = request["identity"]
    files = request.get("files")
    if not isinstance(files, list) or len(files) > MAX_FILES:
        raise InvalidData("INVALID_FILE_COUNT")
    snapshot = identity.get("snapshotId")
    if not isinstance(snapshot, str) or not re.fullmatch(r"dwscan_[a-f0-9]{64}", snapshot):
        raise InvalidData("INVALID_SNAPSHOT_ID")
    result = result_template()
    coverage = result["coverage"]
    coverage["inputFiles"] = len(files)
    node_bytes = 0
    seen_paths = set()
    # Duplicate paths fail the request rather than selecting either identity.
    for item in files:
        if not isinstance(item, dict) or not safe_path(item.get("path")):
            raise InvalidData("INVALID_SOURCE_PATH")
        if item["path"] in seen_paths:
            raise InvalidData("DUPLICATE_SOURCE_PATH")
        seen_paths.add(item["path"])
    total_bytes = 0
    for item in sorted(files, key=lambda entry: entry["path"]):
        path = item["path"]
        language = language_for(path)
        record = {"path": path, "language": language, "status": "UNKNOWN",
                  "syntaxValidated": False, "retainedNodes": 0,
                  "omittedNodes": 0, "omittedContainers": 0}
        coverage["files"].append(record)
        content, expected = item.get("content"), item.get("sourceSha256")
        try:
            if not isinstance(content, str) or not isinstance(expected, str) or not HASH.fullmatch(expected):
                raise InvalidData("INVALID_SOURCE")
            try:
                raw = content.encode("utf-8")
            except UnicodeEncodeError:
                raise InvalidData("INVALID_SOURCE_ENCODING") from None
            total_bytes += len(raw)
            if total_bytes > MAX_INPUT_BYTES:
                raise InvalidData("TOTAL_SOURCE_LIMIT")
            if len(raw) > MAX_FILE_BYTES:
                record.update(status="TRUNCATED", reason="FILE_BYTE_LIMIT")
                coverage["truncatedFiles"] += 1
                continue
            if hashlib.sha256(raw).hexdigest() != expected:
                raise InvalidData("SOURCE_HASH_MISMATCH")
            if language not in ("json", "toml") or (language == "toml" and tomllib is None):
                record.update(status="UNSUPPORTED", reason="NO_QUALIFIED_STDLIB_PARSER")
                coverage["unsupportedFiles"] += 1
                continue
            try:
                parsed = strict_json(content) if language == "json" else tomllib.loads(content)
            except InvalidData:
                raise
            except (ValueError, RecursionError, OverflowError):
                raise InvalidData("DOCUMENT_PARSE_FAILED") from None
            record.update(status="PARSED", syntaxValidated=True)
            coverage["parsedFiles"] += 1
            # Iterative walk: scalar/array values are never emitted or stringified.
            stack = [(parsed, "", 0)]
            while stack:
                value, pointer, depth = stack.pop()
                if not isinstance(value, (dict, list)):
                    continue
                if depth > MAX_DEPTH:
                    record["omittedContainers"] += 1
                    continue
                if isinstance(value, list):
                    for index in reversed(range(len(value))):
                        child = value[index]
                        if isinstance(child, (dict, list)):
                            stack.append((child, pointer + "/" + str(index), depth + 1))
                    continue
                for key in sorted(value):
                    child = value[key]
                    child_pointer = pointer + "/" + key.replace("~", "~0").replace("/", "~1")
                    if len(key.encode("utf-8", "surrogatepass")) > MAX_KEY_BYTES or len(child_pointer.encode("utf-8", "surrogatepass")) > MAX_POINTER_BYTES:
                        record["omittedNodes"] += 1
                        if isinstance(child, (dict, list)):
                            record["omittedContainers"] += 1
                        continue
                    kind = "config-section" if isinstance(child, dict) else "config-key"
                    identifier = "data_" + hashlib.sha256(encode([
                        PROVIDER, identity, path, expected, language, child_pointer, kind,
                    ])).hexdigest()[:32]
                    node = {
                        "id": identifier, "kind": kind, "label": key if key else '"" (empty key)',
                        "qualifiedName": child_pointer, "path": path, "authority": "OBSERVED",
                        "source": {
                            "snapshotId": snapshot, "path": path, "sourceSha256": expected,
                            "language": language, "provider": PROVIDER["name"],
                            "providerVersion": PROVIDER["version"], "line": 1, "endLine": 1,
                            "column": None, "endColumn": None, "locationScope": "file-anchor",
                        },
                    }
                    size = len(encode(node))
                    if len(result["nodes"]) >= MAX_NODES or node_bytes + size > MAX_NODE_BYTES:
                        record["omittedNodes"] += 1
                    else:
                        result["nodes"].append(node)
                        record["retainedNodes"] += 1
                        node_bytes += size
                    if isinstance(child, (dict, list)):
                        stack.append((child, child_pointer, depth + 1))
            if record["omittedNodes"] or record["omittedContainers"]:
                record.update(status="TRUNCATED", reason="KEY_PROJECTION_LIMIT")
                coverage["truncatedFiles"] += 1
        except InvalidData as error:
            record.update(status="INVALID", reason=str(error))
            coverage["invalidFiles"] += 1
        coverage["omittedNodes"] += record["omittedNodes"]
        coverage["omittedContainers"] += record["omittedContainers"]
    result["nodes"].sort(key=lambda node: node["id"])
    coverage["retainedNodes"] = len(result["nodes"])
    coverage["syntaxValidationComplete"] = (coverage["parsedFiles"] == len(files))
    coverage["keyProjectionComplete"] = (coverage["syntaxValidationComplete"]
        and not coverage["omittedNodes"] and not coverage["omittedContainers"])
    return result


def main():
    try:
        raw = sys.stdin.buffer.read(MAX_INPUT_BYTES + 1)
        if len(raw) > MAX_INPUT_BYTES:
            raise InvalidData("INPUT_BYTE_LIMIT")
        try:
            request = strict_json(raw.decode("utf-8"))
        except InvalidData:
            raise
        except (ValueError, UnicodeDecodeError, RecursionError, OverflowError):
            raise InvalidData("INVALID_REQUEST_JSON") from None
        result = analyze(request)
        output = encode(result)
        if len(output) > MAX_OUTPUT_BYTES:
            raise InvalidData("OUTPUT_BYTE_LIMIT")
    except (InvalidData, MemoryError) as error:
        result = result_template()
        result["status"] = "UNAVAILABLE"
        result["error"] = str(error) if isinstance(error, InvalidData) else "MEMORY_LIMIT"
        output = encode(result)
    sys.stdout.buffer.write(output + b"\n")


if __name__ == "__main__":
    main()
