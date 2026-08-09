/* Build-time bake: render the SDF bust once, here, and emit a JPEG data URI.

   Doing this at build rather than at boot means the shipped page contains no
   WebGL at all — no GPU dependency, no boot cost, identical on every device,
   and one entire failure surface (context loss, driver quirks) disappears.

   Because it runs offline, quality is free: we supersample 2x and downsample,
   which no runtime budget would allow, and we add a real separable-ish bloom
   in Canvas 2D so the emissive visor and chest core glow instead of looking
   like flat teal decals. */
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path');
const frag = fs.readFileSync(path.join(__dirname, 'frag.glsl'), 'utf8');

const CHROME = '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';

async function bake(page, w, h, quality, ss, frame) {
  const out = await page.evaluate(([FS, W, H, Q, SS, FR]) => {
    // ── 1. raymarch at SS× resolution into an offscreen GL canvas ──────────
    const gc = document.createElement('canvas');
    gc.width = W * SS; gc.height = H * SS;
    const gl = gc.getContext('webgl', { preserveDrawingBuffer: true, antialias: false });
    if (!gl) return { err: 'no webgl' };
    const sh = (t, s) => {
      const x = gl.createShader(t); gl.shaderSource(x, s); gl.compileShader(x);
      return gl.getShaderParameter(x, gl.COMPILE_STATUS) ? x : gl.getShaderInfoLog(x);
    };
    const vs = sh(gl.VERTEX_SHADER, 'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}');
    const fs2 = sh(gl.FRAGMENT_SHADER, FS);
    if (typeof vs === 'string') return { err: 'vs: ' + vs };
    if (typeof fs2 === 'string') return { err: 'fs: ' + fs2 };
    const pg = gl.createProgram(); gl.attachShader(pg, vs); gl.attachShader(pg, fs2);
    gl.linkProgram(pg);
    if (!gl.getProgramParameter(pg, gl.LINK_STATUS)) return { err: 'link: ' + gl.getProgramInfoLog(pg) };
    gl.useProgram(pg);
    const bf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, bf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const l = gl.getAttribLocation(pg, 'a'); gl.enableVertexAttribArray(l);
    gl.vertexAttribPointer(l, 2, gl.FLOAT, false, 0, 0);
    gl.uniform2f(gl.getUniformLocation(pg, 'uRes'), W * SS, H * SS);
    gl.uniform2f(gl.getUniformLocation(pg, 'uFrame'), FR[0], FR[1]);
    gl.viewport(0, 0, W * SS, H * SS);
    gl.drawArrays(gl.TRIANGLES, 0, 3); gl.finish();

    // ── 2. downsample (this is the antialiasing) ───────────────────────────
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(gc, 0, 0, W, H);

    /* ── 3. bloom ───────────────────────────────────────────────────────────
       Isolate the bright pixels, blur them, add them back. Without the
       threshold pass a plain blurred copy would fog the whole frame; with it,
       only the emissive visor and core actually glow, which is the point. */
    const bl = document.createElement('canvas'); bl.width = W; bl.height = H;
    const bx = bl.getContext('2d');
    bx.drawImage(c, 0, 0);
    const im = bx.getImageData(0, 0, W, H), d = im.data;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i] / 255, g = d[i + 1] / 255, bb = d[i + 2] / 255;
      const lum = r * 0.30 + g * 0.59 + bb * 0.11;
      /* Chroma gate. A luminance-only threshold also blooms the white specular
         hit on the polished cranium, which then reads as a lamp stuck to the
         robot's head rather than a highlight. Real emissives here are cyan, so
         weight the threshold by how far the pixel is from neutral toward
         green-blue: the metal highlights stay crisp, the visor and core glow. */
      const chroma = Math.max(0, (g + bb) * 0.5 - r) / 0.6;
      const k = Math.max(0, lum - 0.55) / 0.45 * Math.min(1, 0.12 + chroma);
      d[i] *= k; d[i + 1] *= k; d[i + 2] *= k;
    }
    bx.putImageData(im, 0, 0);

    // two blur radii: a tight core glow and a wide halo
    ctx.globalCompositeOperation = 'lighter';
    ctx.filter = 'blur(' + Math.round(W / 190) + 'px)'; ctx.globalAlpha = 0.85;
    ctx.drawImage(bl, 0, 0);
    ctx.filter = 'blur(' + Math.round(W / 42) + 'px)'; ctx.globalAlpha = 0.55;
    ctx.drawImage(bl, 0, 0);
    ctx.filter = 'none'; ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';

    return { url: c.toDataURL('image/jpeg', Q) };
  }, [frag, w, h, quality, ss, frame]);
  if (out.err) throw new Error('bake failed: ' + out.err);
  return out.url;
}

(async () => {
  const b = await chromium.launch({
    executablePath: CHROME,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
  });
  const page = await b.newPage({ viewport: { width: 400, height: 300 } });
  await page.setContent('<body></body>');

  /* Hero backdrop. Framed almost square and tight on the subject: it is
     anchored to the right edge of a wide hero, so a landscape crop wastes most
     of its pixels on empty studio and pushes the head out of frame. Inlined as
     a data URI, so every byte is page weight — q0.78 is the point where the
     next step down starts to show banding in the backdrop gradient. */
  const hero = await bake(page, 1150, 1150, 0.78, 2, [1.62, 0.02]);
  fs.writeFileSync(path.join(__dirname, 'bust.datauri'), hero);
  fs.writeFileSync(path.join(__dirname, 'bust-baked.jpg'),
    Buffer.from(hero.split(',')[1], 'base64'));

  // Social card. This one is a real file on disk, not a data URI: og:image
  // must be an absolute fetchable URL — crawlers will not read a data URI.
  const og = await bake(page, 1200, 630, 0.86, 2, [2.15, 0.0]);
  fs.writeFileSync(path.join(__dirname, 'og.jpg'), Buffer.from(og.split(',')[1], 'base64'));

  await b.close();
  console.log(`hero 1150x1150 SSAA2 q0.78 → ${(hero.length / 1024).toFixed(0)} KB data URI`);
  console.log(`og   1200x630  SSAA2 q0.86 → ${(og.length / 1024 * 0.75).toFixed(0)} KB file`);
})().catch(e => { console.error(e); process.exit(1); });
