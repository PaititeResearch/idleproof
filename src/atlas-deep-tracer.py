"""Trusted instrumentation for Atlas's fixed synthetic fixtures, never a general runner.

Executed only inside the verified Linux bubblewrap boundary by atlas-deep-runtime.mjs.
No argument values, return values, exception messages, locals or target output are retained.
"""
from __future__ import annotations
import hashlib
import io
import json
import os
from pathlib import Path
import resource
import runpy
import sys
import time

VERSION = "1"
MAX_EVENTS = 1000


def probe():
    # This trusted code probes the boundary, and never imports/executes target files.
    namespaces = {name: os.readlink("/proc/self/ns/" + name) for name in ("net", "mnt", "pid", "user")}
    writable = False
    try:
        Path("/fixture/.atlas-write-probe").write_text("forbidden")
        writable = True
    except OSError:
        pass
    cap = next((s.split(":", 1)[1].strip() for s in Path("/proc/self/status").read_text().splitlines() if s.startswith("CapEff:")), None)
    print(json.dumps({"schema": "idleproof.atlas-isolation-probe.v1", "namespaces": namespaces,
                      "fixtureReadOnly": not writable, "privateTmp": Path("/tmp").is_dir(),
                      "environmentEmpty": not any(k for k in os.environ if k != "LC_CTYPE"),
                      "capsZero": cap is not None and int(cap, 16) == 0,
                      "cpuLimit": resource.getrlimit(resource.RLIMIT_CPU)[0],
                      "memoryLimit": resource.getrlimit(resource.RLIMIT_AS)[0],
                      "processLimit": resource.getrlimit(resource.RLIMIT_NPROC)[0],
                      "fileLimit": resource.getrlimit(resource.RLIMIT_FSIZE)[0]}))


def instrument():
    # The parent creates and hash-checks a fixed fixture. This path is not supplied by target code.
    specification = json.loads(Path("/fixture-manifest.json").read_text())
    files = specification["files"]
    for name, expected in files.items():
        if hashlib.sha256((Path("/fixture") / name).read_bytes()).hexdigest() != expected:
            raise ValueError("RUNTIME_SOURCE_MISMATCH")
    events = []
    start = time.monotonic_ns()
    calls = {}
    truncated = False
    def ref(frame):
        filename = frame.f_code.co_filename
        if not filename.startswith("/fixture/"):
            return None
        name = filename[len("/fixture/"):]
        if name not in files:
            return None
        return {"path": name, "sourceSha256": files[name], "line": frame.f_code.co_firstlineno,
                "qualifiedName": frame.f_code.co_qualname, "kind": "module" if frame.f_code.co_name == "<module>" else "function"}
    def trace(frame, event, arg):
        nonlocal truncated
        if event not in ("call", "return", "exception"):
            return trace
        target = ref(frame)
        if target is None:
            return trace
        if len(events) >= MAX_EVENTS:
            truncated = True
            # Stop tracing immediately; the wall/CPU boundary still governs execution.
            sys.settrace(None)
            return None
        now = time.monotonic_ns()
        parent = ref(frame.f_back) if frame.f_back else None
        site = None
        if parent is not None:
            site = {"path": parent["path"], "sourceSha256": parent["sourceSha256"], "line": frame.f_back.f_lineno}
        item = {"sequence": len(events), "event": event.upper(), "atNs": now - start,
                "function": target, "caller": parent, "callSite": site}
        if event == "call":
            calls[id(frame)] = (len(events), now)
            item["invocation"] = len(events)
        else:
            invocation, began = calls.get(id(frame), (None, now))
            item["invocation"] = invocation
            item["durationNs"] = now - began
            if event == "return":
                calls.pop(id(frame), None)
        events.append(item)
        return trace
    status = "COMPLETED"
    # Synthetic fixed files may import each other; only /fixture plus the isolated stdlib.
    sys.path.insert(0, "/fixture")
    original_stdout, original_stderr = sys.stdout, sys.stderr
    try:
        # Target output is discarded rather than retained or forwarded to the host.
        with open(os.devnull, "w") as sink:
            sys.stdout = sys.stderr = sink
            sys.settrace(trace)
            try:
                runpy.run_path("/fixture/runtime_demo.py", run_name="__main__")
            except BaseException:
                status = "FAILED"
            finally:
                sys.settrace(None)
                sys.stdout, sys.stderr = original_stdout, original_stderr
    finally:
        sys.settrace(None)
        sys.stdout, sys.stderr = original_stdout, original_stderr
    print(json.dumps({"instrumentationVersion": VERSION, "status": "INTERRUPTED" if truncated else status,
                      "events": events, "truncated": truncated,
                      "durationNs": time.monotonic_ns() - start,
                      "peakRssKiB": resource.getrusage(resource.RUSAGE_SELF).ru_maxrss}))


if __name__ == "__main__":
    if sys.argv[1:] == ["--probe"]:
        probe()
    elif sys.argv[1:] == ["--instrument-fixed-fixture"]:
        instrument()
    else:
        raise SystemExit(2)
