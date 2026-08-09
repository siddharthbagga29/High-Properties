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

async function bake(page, w, h, quality, ss, frame, yaw) {
  const out = await page.evaluate(([FS, W, H, Q, SS, FR, YAW]) => {
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
    gl.uniform1f(gl.getUniformLocation(pg, 'uYaw'), YAW || 0);
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

    /* ── 4. resolve the frame edges to the page background ──────────────────
       A JPEG has no alpha, so whatever fills the empty studio around the
       subject is painted onto the page as an opaque block — and the image's
       bounding box reads as a faint but perfectly straight-edged panel behind
       the hero. Landing the outer band on the page colour makes the boundary
       disappear because there is nothing left to see.

       This has to run AFTER bloom. Done inside the shader it ran before, and
       the bloom then bled bright interior pixels back out across the band,
       leaving a halo ring exactly where the seam had been. The blend must be
       the last operation that touches the image.

       Per-axis, not radial: a radial band saturates in the corners long before
       it reaches the middle of the top and bottom edges, so the horizontal
       seams survive it. */
    const px = ctx.getImageData(0, 0, W, H), q = px.data;
    const PAGE = [5, 7, 10];
    const ss01 = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
                                return t * t * (3 - 2 * t); };
    for (let y = 0; y < H; y++) {
      const ey = ss01(0.72, 1.0, Math.abs(y / H * 2 - 1));
      for (let x = 0; x < W; x++) {
        const ex = ss01(0.72, 1.0, Math.abs(x / W * 2 - 1));
        const k = Math.max(ex, ey);
        if (k <= 0) continue;
        const i = (y * W + x) * 4;
        q[i]     += (PAGE[0] - q[i])     * k;
        q[i + 1] += (PAGE[1] - q[i + 1]) * k;
        q[i + 2] += (PAGE[2] - q[i + 2]) * k;
      }
    }
    ctx.putImageData(px, 0, 0);

    return { url: c.toDataURL('image/jpeg', Q) };
  }, [frag, w, h, quality, ss, frame, yaw]);
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
  const hero = await bake(page, 1150, 1150, 0.78, 2, [1.78, 0.02]);
  fs.writeFileSync(path.join(__dirname, 'bust.datauri'), hero);
  fs.writeFileSync(path.join(__dirname, 'bust-baked.jpg'),
    Buffer.from(hero.split(',')[1], 'base64'));

  // Social card. This one is a real file on disk, not a data URI: og:image
  // must be an absolute fetchable URL — crawlers will not read a data URI.
  const og = await bake(page, 1200, 630, 0.86, 2, [2.15, 0.0]);
  fs.writeFileSync(path.join(__dirname, 'og.jpg'), Buffer.from(og.split(',')[1], 'base64'));

  /* ── turntable atlas ──────────────────────────────────────────────────────
     REEL_N views of the same bust across a small yaw arc, laid out as one
     horizontal strip. At runtime the page blits one cell of this strip into a
     small canvas and cross-fades between neighbours, so the subject turns to
     follow the pointer.

     Why a pre-rendered strip rather than live raymarching: this shader costs
     ~130 sphere-tracing steps per pixel with soft shadows and five-tap AO. It
     is perfectly affordable once, offline, at 2x supersampling. It is not
     affordable sixty times a second on an integrated GPU, and a hero that
     stutters on the machines most visitors actually own is worse than a hero
     that does not move. A strip blit is a single texture copy; the cost does
     not depend on the shader's complexity at all, so the model can keep
     getting more detailed without the interaction getting slower.

     Arc and frame count are coupled and were set by looking at the result.
     +/-13 degrees was measurably there and visually invisible — two frames from
     opposite ends of the arc were nearly indistinguishable, so the interaction
     did not exist for a viewer even though it existed in the code. +/-23 degrees
     reads unmistakably. Widening the arc without adding cells would have made
     each cross-fade a 9-degree ghost rather than a rotation, so the count went
     up with it. A full 360-degree turntable would need an order of magnitude
     more frames again, and the back of a bust is not interesting. */
  /* Sized against the byte budget, not against what looks best in isolation.
     13 cells at 620px came out at 279 KB, which would have taken the home page
     from 158 KB to 440 KB — nearly tripling the flagship page to animate one
     decorative element. 11 cells at 460px lands at half of that. The lost pixel
     resolution costs little because this layer only ever appears in the dark
     right-hand third of the hero, under a scrim, where the upscale reads as
     depth of field rather than as blur. */
  /* guards.js re-bakes to prove its shader guards are not vacuous, and the
     reel is by far the slowest part. BAKE_ONLY=hero renders the still and the
     social card and stops, which keeps a verification run to seconds. */
  if (process.env.BAKE_ONLY === 'hero') { await b.close(); return; }

  const REEL_N = 11, REEL_PX = 460, REEL_ARC = 0.40;   // radians each side
  const cells = [];
  for (let i = 0; i < REEL_N; i++) {
    const yaw = -REEL_ARC + (2 * REEL_ARC) * (i / (REEL_N - 1));
    cells.push(await bake(page, REEL_PX, REEL_PX, 0.68, 2, [1.78, 0.02], yaw));
    process.stdout.write(`  reel ${i + 1}/${REEL_N}\r`);
  }
  const atlas = await page.evaluate(async ([urls, N, PX]) => {
    const c = document.createElement('canvas');
    c.width = N * PX; c.height = PX;
    const ctx = c.getContext('2d');
    for (let i = 0; i < urls.length; i++) {
      const img = new Image();
      await new Promise(r => { img.onload = r; img.src = urls[i]; });
      ctx.drawImage(img, i * PX, 0);
    }
    return c.toDataURL('image/jpeg', 0.68);
  }, [cells, REEL_N, REEL_PX]);
  fs.writeFileSync(path.join(__dirname, 'reel.datauri'), atlas);
  fs.writeFileSync(path.join(__dirname, 'reel.json'),
    JSON.stringify({ frames: REEL_N, cell: REEL_PX, arc: REEL_ARC }));
  fs.writeFileSync(path.join(__dirname, 'reel-preview.jpg'),
    Buffer.from(atlas.split(',')[1], 'base64'));
  console.log(`reel ${REEL_N}x${REEL_PX}px q0.68 → ${(atlas.length / 1024).toFixed(0)} KB data URI`);

  await b.close();
  console.log(`hero 1150x1150 SSAA2 q0.78 → ${(hero.length / 1024).toFixed(0)} KB data URI`);
  console.log(`og   1200x630  SSAA2 q0.86 → ${(og.length / 1024 * 0.75).toFixed(0)} KB file`);
})().catch(e => { console.error(e); process.exit(1); });
