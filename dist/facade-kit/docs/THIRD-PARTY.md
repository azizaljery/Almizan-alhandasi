# Sources and licenses

No npm installation, CDN request or asset download is required to run this package.

| Included code | Pinned source | License |
|---|---|---|
| Three.js ESM, RGBELoader, GLTFExporter, TextureUtils | https://github.com/mrdoob/three.js/tree/r160 | MIT; see `vendor/THREE-LICENSE.txt` |
| polygon-clipping bundled distribution 0.15.7 | https://github.com/mfogel/polygon-clipping/tree/v0.15.7 | MIT; see `vendor/POLYGON-CLIPPING-LICENSE.txt`; bundled third-party notices retained |

Three addon imports were rewritten to local relative paths. The polygon-clipping UMD bundle is wrapped as ESM using a local `module.exports`. Its readable bundled code is included, retaining the distribution's license comments. Application modules under `src/`, `integration/`, `scripts/`, and `tests/` were created for this deliverable and can be edited by the project owner. No separate restrictive license is added to that application code.

Native integration was checked against `azizaljery/Almizan-alhandasi` at commit `c8acdd3e4d14f30c59213d3abcca5625e9f0707e`, using these read-only files:

* `dist/facade-realism/model.mjs`
* `dist/facade-styles.mjs`
* `dist/draw/topology.mjs`, `geom.mjs`, `doc.mjs`, `catalog.mjs`
* `tests/fixtures/facade/C1.json`

Repository source modules were not copied into the runtime package. `examples/source-C1.json` is the owner's fixture, `source-built.json` and `source-transforms.json` are outputs of the pinned native functions. The example roof uses the concave native topology outline with an explicitly assumed visual thickness; it is not a structural model. The package is intended for the owner's project, not redistribution of those project examples without checking the project's rights.

All included procedural surface maps and analytic sky pixels are generated from original code in this package. They are demonstration assets, not photographs, scans, branded products, material certifications or evidence of compliance. There is no HDR photograph or downloaded stone texture bundled. Technical standards for stone/fire performance have not been asserted or incorporated.

`assets/manifest.template.json` is a template with placeholders, not an asset record approved for loading or attribution. Supply and review the actual source, license, required credit, physical scale and optional SHA-256 of every map before using external materials.
