# Vendored TypeScript parser provenance

Recorded 22 October 2026 for the experimental Atlas Deep provider.

- Package: `typescript`, version **5.9.3**.
- Publisher/author recorded by the package: Microsoft Corp.
- Package-declared license: **Apache-2.0**. The package license and third-party notices are retained verbatim beside the parser.
- Upstream repository: <https://github.com/microsoft/TypeScript>.
- Canonical npm tarball URL: <https://registry.npmjs.org/typescript/-/typescript-5.9.3.tgz>.
- Local input archive used for the byte comparison: `typescript-5.9.3.tgz`, 4,377,468 bytes.

The archive was already present in the task's temporary vendor staging directory. This record verifies the local archive's hashes and the retained files against its extracted contents. It does **not** claim that npm registry metadata, publisher signatures, registry signatures, provenance attestations or an authenticated release chain were independently verified. The canonical URL identifies the intended upstream distribution; it is not a signature-verification result.

## Retained files

| Retained path | Path in archive | Bytes | SHA-256 |
|---|---|---:|---|
| `typescript.cjs` | `package/lib/typescript.js` | 9,112,572 | `3ae902c92cc44dace175c0e69e13a4b0899f6983c6121d76b9ab8dd5795e7675` |
| `LICENSE.txt` | `package/LICENSE.txt` | 9,197 | `a7d00bfd54525bc694b6e32f64c7ebcf5e6b7ae3657be5cc12767bce74654a47` |
| `ThirdPartyNoticeText.txt` | `package/ThirdPartyNoticeText.txt` | 37,824 | `1af3c68039c57e539422da82a4faada506ce6d0ea6f90e0b699d02dbcdb7a90c` |

All three comparisons were byte-identical. Only the parser filename extension changed from `.js` to `.cjs`, to preserve CommonJS loading inside IdleProof's ESM package. The parser's contents were not patched, minified or regenerated. Other package files, compiler launchers and standard-library declaration files were not vendored. The archive is a staging/verification input, not a runtime dependency downloaded at launch.

## Archive hashes, recomputed locally

SHA-256:

```text
10e108c9cf7d5f2879053dff18515fb405abf2ccef63eaaf017d9c571687a1d3
```

SHA-512:

```text
8e5d6f6733c38a72ebf5e52ddc9feded5e8580d130f508ef04f772b33f4a7d00c3e357d0ac2d98e2f290762694a454f86d795bd511e12e9a7cc2d9ba3394e04b
```

The same locally computed SHA-512 in SRI notation:

```text
sha512-jl1vZzPDinLr9eUt3J/t7V6FgNEw9QjvBPdysz9KfQDD41fQrC2Y4vKQdiaUpFT4bXlb1RHhLpp8wtm6M5TgSw==
```

This SRI value was calculated from the local archive. It is not represented as a separately verified registry `dist.integrity` value. Content hashes detect byte changes relative to this record; they do not by themselves establish authenticity, producer correctness or security.

## Runtime use and update policy

`src/atlas-deep-javascript.mjs` imports this exact file and rejects a `ts.version` other than `5.9.3`. It uses source parsing and syntax utilities over supplied captured strings. It does not invoke compiler emit, a project host, the type checker, a language server, target configuration/plugins or a package installer. Loading the parser is separate from executing the target program.

An update must preserve the appropriate license/notices, establish the replacement bytes and source, rerun the positive/negative/adversarial provider corpus and shared graph-admission tests, and explicitly assess parser/API/coordinate behavior changes. A newer compiler is not an automatic compatibility upgrade.
