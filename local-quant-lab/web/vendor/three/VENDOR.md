# three.js (vendored)

- Package: `three@0.180.0` from the npm registry, MIT licence (`LICENSE`, copied unchanged).
- Tarball integrity checked against the registry: `sha512-o+qycAMZrh+TsE01GqWUxUIKR1AL0S8pq7zDkYOQw8GqfX8b8VoCKYUoHbhiX5j+7hr8XsuHDVU6+gkQJQKg9w==` (2026-10-22).
- Files and SHA-256 (pinned by `tests/test_security.py`):
  - 61ba0df005b05991361d040d8ff670e1aadfd0ce7aeebd1fdb0725957a8957de  three.core.min.js
  - e2b5ee6bccd38fd6d8a2428546b83c5f2426d84b152ef82be8055556e3b40eb6  three.module.min.js
  - 6c860c6b342200f8aef65493319c12bfb2d652107355b1d25eb2154371128391  OrbitControls.js
- `three.core.min.js` and `three.module.min.js` are `build/` files, unchanged.
- `OrbitControls.js` is `examples/jsm/controls/OrbitControls.js` with one change: `from 'three'` became `from './three.module.min.js'`, because the page's CSP (`script-src 'self'`) does not allow an inline import map.
- Why vendored and not a CDN: the console is local-first and its CSP forbids remote scripts. Why not npm at runtime: there is no build step.
- Loaded lazily (dynamic `import()`) only when the Overview's 3D floor is shown, so the rest of the console does not pay for it.
- To upgrade: `npm pack three@<version>`, verify the integrity against `npm view three@<version> dist.integrity`, copy the same files, re-apply the one-line change, update the hashes here and in the test.
