/* ============================================================
 * 合戦ズ ― 歴史空想RPG
 * 長久手市文化の家『合戦ズ』(作: 麻原奈未) を原作にした短編RPG。
 * Vanilla JS / 依存ゼロ / ビルド不要 / file:// でも動く。
 * このファイルがそのまま本編エンジンの土台になる構成。
 * 原作: 長久手市文化の家『合戦ズ』(作: 麻原奈未)
 * ========================================================== */
(function () {
  'use strict';

  // ===================== Canvas =====================
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const TILE = 32, COLS = 16, ROWS = 14;
  const W = TILE * COLS, H = TILE * ROWS; // 512 x 448（論理座標）
  // HD: 内部解像度を2倍で描画（文字・画像・図形がくっきり）。論理座標は 512x448 のまま、
  // 毎フレーム setTransform(RES) でスケールする。表示サイズは CSS 側で固定
  const RES = 2;
  canvas.width = W * RES; canvas.height = H * RES;

  // ===================== Input =====================
  const held = new Set();
  const edges = new Set();
  const ACTIONS = {
    up:      ['ArrowUp', 'KeyW', 'UP'],
    down:    ['ArrowDown', 'KeyS', 'DOWN'],
    left:    ['ArrowLeft', 'KeyA', 'LEFT'],
    right:   ['ArrowRight', 'KeyD', 'RIGHT'],
    confirm: ['Enter', 'Space', 'KeyZ', 'BTN_A'],
    cancel:  ['Escape', 'KeyX', 'BTN_B'],
  };
  function pressCode(code) { if (!held.has(code)) edges.add(code); held.add(code); }
  function releaseCode(code) { held.delete(code); }
  window.addEventListener('keydown', function (e) {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].indexOf(e.code) >= 0) e.preventDefault();
    pressCode(e.code);
  });
  window.addEventListener('keyup', function (e) { releaseCode(e.code); });
  const Input = {
    down: function (a) { return ACTIONS[a].some(function (c) { return held.has(c); }); },
    pressed: function (a) { return ACTIONS[a].some(function (c) { return edges.has(c); }); },
    clearEdges: function () { edges.clear(); },
  };
  function bindBtn(id, code) {
    const el = document.getElementById(id);
    if (!el) return;
    const on = function (e) { e.preventDefault(); pressCode(code); };
    const off = function (e) { e.preventDefault(); releaseCode(code); };
    el.addEventListener('touchstart', on, { passive: false });
    el.addEventListener('touchend', off, { passive: false });
    el.addEventListener('touchcancel', off, { passive: false });
    el.addEventListener('mousedown', on);
    el.addEventListener('mouseup', off);
    el.addEventListener('mouseleave', off);
  }
  bindBtn('btnUP', 'UP'); bindBtn('btnDOWN', 'DOWN');
  bindBtn('btnLEFT', 'LEFT'); bindBtn('btnRIGHT', 'RIGHT');
  bindBtn('btnA', 'BTN_A'); bindBtn('btnB', 'BTN_B');
  canvas.addEventListener('pointerdown', function (e) { e.preventDefault(); pressCode('BTN_A'); });
  canvas.addEventListener('pointerup', function () { releaseCode('BTN_A'); });
  canvas.addEventListener('pointerleave', function () { releaseCode('BTN_A'); });

  // ===================== Utils =====================
  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }
  // 行頭に来てはいけない約物（行頭禁則）。改行時、これらが行頭に来るなら前の行に追い込む。
  var NOHEAD = '、。，．・：；！？”’）］｝」』】〉》〕…ーっゃゅょゎぁぃぅぇぉヵヶ';
  function wrapText(c, text, maxw) {
    const lines = [];
    let cur = '';
    for (const ch of text) {
      if (ch === '\n') { lines.push(cur); cur = ''; continue; }
      const test = cur + ch;
      if (c.measureText(test).width > maxw && cur) {
        if (NOHEAD.indexOf(ch) >= 0) { cur = test; } // 約物は前の行に残す
        else { lines.push(cur); cur = ch; }
      } else cur = test;
    }
    if (cur) lines.push(cur);
    return lines;
  }
  function rnd(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
  function tileHash(col, row, salt) {
    var n = col * 374761 + row * 668265 + (salt || 0) * 127413;
    n = ((n ^ (n >> 13)) * 1103515) | 0;
    return ((n ^ (n >> 16)) & 0x7fff) / 0x7fff;
  }
  function smoothHash(x, y, salt) {
    var ix = Math.floor(x), iy = Math.floor(y);
    var fx = x - ix, fy = y - iy;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    var a = tileHash(ix, iy, salt), b = tileHash(ix + 1, iy, salt);
    var d = tileHash(ix, iy + 1, salt), e = tileHash(ix + 1, iy + 1, salt);
    return a + (b - a) * fx + (d - a) * fy + (a - b - d + e) * fx * fy;
  }
  function fillSmooth(c, tc, tr, x, y, colorFn) {
    var SN = 4, SS = TILE / SN;
    for (var sj = 0; sj < SN; sj++) for (var si = 0; si < SN; si++) {
      c.fillStyle = colorFn(smoothHash(tc + (si + 0.5) / SN, tr + (sj + 0.5) / SN, 0));
      c.fillRect(x + si * SS, y + sj * SS, SS + 1, SS + 1);
    }
  }

  // ===================== Particles =====================
  var PARTS = [];
  function emitP(x, y, vx, vy, life, color, size, grav) {
    if (PARTS.length > 300) return;
    PARTS.push({x:x,y:y,vx:vx||0,vy:vy||0,life:life,ml:life,c:color||'#fff',s:size||1.5,g:grav||0});
  }
  function updateParts(dt) {
    for (var i = PARTS.length - 1; i >= 0; i--) {
      var p = PARTS[i];
      p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
      if (p.life <= 0) PARTS.splice(i, 1);
    }
  }
  function drawParts(c) {
    for (var i = 0; i < PARTS.length; i++) {
      var p = PARTS[i], a = p.life / p.ml;
      c.globalAlpha = (a < 0.15 ? a / 0.15 : 1) * (a > 0.8 ? (1 - a) / 0.2 : 1) * 0.85;
      c.fillStyle = p.c;
      c.beginPath(); c.arc(p.x, p.y, p.s * (0.3 + a * 0.7), 0, Math.PI * 2); c.fill();
    }
    c.globalAlpha = 1;
  }
  function clearParts() { PARTS.length = 0; }

  // ===================== Atmosphere =====================
  function drawLightPool(c, x, y, r, color, alpha) {
    var g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = alpha || 1;
    c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
    c.restore();
  }
  function drawFogBand(c, y, h, color) {
    var g = c.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.35, color); g.addColorStop(0.65, color); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.fillRect(0, y, W, h);
  }
  function drawSunRays(c, alpha) {
    c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = alpha || 0.035;
    for (var i = 0; i < 5; i++) {
      var bx = 40 + i * 100 + Math.sin(tick * 0.005 + i * 1.7) * 15;
      c.save(); c.translate(bx, -30); c.rotate(-0.6);
      var rg = c.createLinearGradient(0, 0, 28, 0);
      rg.addColorStop(0, 'rgba(255,240,180,0)'); rg.addColorStop(0.5, 'rgba(255,240,180,1)'); rg.addColorStop(1, 'rgba(255,240,180,0)');
      c.fillStyle = rg; c.fillRect(-14, 0, 28, H + 80); c.restore();
    }
    c.restore();
  }
  // パーティクルはワールド座標で保持。発生位置はカメラ可視範囲を基準にする。
  function spawnFieldParts(tileset, camX, camY) {
    camX = camX || 0; camY = camY || 0;
    if (tileset === 'museum') {
      if (tick % 12 === 0) emitP(camX + rnd(40, W - 40), camY + rnd(20, H - 160), 3 + Math.random() * 4, 6 + Math.random() * 4, 5, 'rgba(255,230,180,0.5)', 1 + Math.random() * 0.5, 0);
    } else {
      if (tick % 20 === 0) emitP(camX + rnd(20, W - 20), camY + rnd(20, H - 100), (Math.random() - 0.5) * 6, -2 + Math.random() * 2, 6, 'rgba(160,255,120,0.6)', 1.5 + Math.random(), 0);
      if (tick % 45 === 0) emitP(camX + rnd(0, W), camY - 5, 8 + Math.random() * 12, 15 + Math.random() * 8, 7, 'rgba(255,200,210,0.5)', 2 + Math.random(), 2);
    }
  }
  function spawnBattleParts() {
    if (tick % 6 === 0) emitP(rnd(60, W - 60), H * 0.52 + Math.random() * 30, (Math.random() - 0.5) * 12, -18 - Math.random() * 25, 3.5, '#ff8844', 1 + Math.random() * 0.8, -3);
    if (tick % 18 === 0) emitP(rnd(0, W), 200 + Math.random() * 30, (Math.random() - 0.5) * 4, -1.5, 5, 'rgba(180,200,230,0.25)', 4 + Math.random() * 3, 0);
  }

  // ===================== Actor sprites =====================
  const PAL = {
    oda:   { body: '#f1f3f5', legs: '#343a40', skin: '#ffd8a8', hair: '#3a2a1a', short: true },
    ike:   { body: '#3b5bdb', legs: '#1e3a8a', skin: '#ffd8a8', hair: '#212529', helmet: '#2b3a67', crest: '#ffd43b' },
    michi: { body: '#2f9e44', legs: '#1b4332', skin: '#ffd8a8', hair: '#3b2b20', helmet: '#3b5d3b', crest: '#c0c0c0' },
    kancho: { body: '#2b3a4a', legs: '#212529', skin: '#ffd8a8', hair: '#adb5bd', short: true },
    odoriko: { body: '#e8dff0', legs: '#c9b8d8', skin: '#ffd8a8', hair: '#3d2a55' },
    civ1: { body: '#c98747', legs: '#5a4632', skin: '#ffd8a8', hair: '#4a3423', short: true },
    civ2: { body: '#5b8c5a', legs: '#33502f', skin: '#ffd8a8', hair: '#6b4a35' },
    sakamoto: { body: '#7048a8', legs: '#3d2a55', skin: '#ffd8a8', hair: '#2b2b2b', short: true },
  };
  function drawShadow(c, cx, cy, s) {
    c.fillStyle = 'rgba(0,0,0,0.25)';
    c.beginPath(); c.ellipse(cx, cy + 14 * s, 11 * s, 5 * s, 0, 0, Math.PI * 2); c.fill();
  }
  function facingInfo(f) {
    var hx = f.indexOf('left') >= 0 ? -1 : f.indexOf('right') >= 0 ? 1 : 0;
    var hy = f.indexOf('up') >= 0 ? -1 : f.indexOf('down') >= 0 ? 1 : 0;
    return { hx: hx, hy: hy, isBack: hy < 0, isSide: hx !== 0, dir: hx, isDiag: hx !== 0 && hy !== 0 };
  }
  function drawHumanoid(c, cx, cy, s, col, facing, moving) {
    var runT = tick * 0.16;
    var runSin = Math.sin(runT);
    var bob = moving ? -Math.abs(runSin) * 1.5 * s : Math.sin(tick * 0.04) * s;
    var by = cy + bob;
    var fi = facingInfo(facing);
    var isBack = fi.isBack;
    var isSide = fi.isSide;
    var dir = fi.dir;
    var armCol = col.helmet ? col.helmet : col.body;
    var legA = moving ? runSin * 3.5 * s : 0;
    var legB = -legA;
    drawShadow(c, cx, cy, s);
    // Legs
    c.fillStyle = col.legs || col.body;
    if (isSide) {
      roundRect(c, cx - 3 * s + dir * 2 * s, by + 9 * s + legA, 5 * s, 5 * s, 1.5 * s); c.fill();
      roundRect(c, cx - 2 * s - dir * 2 * s, by + 9 * s + legB, 5 * s, 5 * s, 1.5 * s); c.fill();
    } else {
      roundRect(c, cx - 6 * s, by + 9 * s + legA, 5 * s, 5 * s, 1.5 * s); c.fill();
      roundRect(c, cx + 1 * s, by + 9 * s + legB, 5 * s, 5 * s, 1.5 * s); c.fill();
    }
    c.fillStyle = 'rgba(255,255,255,0.06)';
    if (!isBack) { c.fillRect(cx - 5 * s, by + 9 * s, 2 * s, 4 * s); c.fillRect(cx + 2 * s, by + 9 * s, 2 * s, 4 * s); }
    // Back arm (behind body for side view)
    var armSwing = moving ? Math.sin(runT + 1.57) * 0.4 : Math.sin(tick * 0.03 + (dir < 0 ? 1 : 0)) * 0.12;
    if (isSide) {
      c.fillStyle = armCol;
      c.save(); c.translate(cx - dir * 6 * s, by + 1 * s); c.rotate(dir * (0.15 + armSwing));
      roundRect(c, -2 * s, 0, 4 * s, 9 * s, 2 * s); c.fill();
      c.fillStyle = col.skin; c.beginPath(); c.arc(0, 9 * s, 2 * s, 0, Math.PI * 2); c.fill();
      c.restore();
    }
    // Body outline
    c.fillStyle = 'rgba(5,3,15,0.55)';
    roundRect(c, cx - 9 * s, by - 5 * s, 18 * s, 17 * s, 5 * s); c.fill();
    // Body
    c.fillStyle = col.body;
    roundRect(c, cx - 8 * s, by - 4 * s, 16 * s, 16 * s, 4 * s); c.fill();
    c.fillStyle = 'rgba(0,0,0,0.12)';
    roundRect(c, cx - 8 * s, by + 4 * s, 16 * s, 8 * s, 4 * s); c.fill();
    // Rim light (front/side only)
    if (!isBack) {
      c.fillStyle = 'rgba(255,240,200,0.18)';
      c.fillRect(cx - 8 * s, by - 3 * s, 2 * s, 13 * s);
    } else {
      c.fillStyle = 'rgba(255,240,200,0.08)';
      c.fillRect(cx + 6 * s, by - 3 * s, 2 * s, 13 * s);
    }
    // Belt
    c.fillStyle = 'rgba(0,0,0,0.2)';
    c.fillRect(cx - 7 * s, by + 3 * s, 14 * s, 2 * s);
    // Armor shoulder plates
    if (col.helmet) {
      c.fillStyle = col.helmet;
      if (isSide) {
        roundRect(c, cx + dir * 3 * s, by - 2 * s, 6 * s, 7 * s, 2 * s); c.fill();
        c.fillStyle = 'rgba(255,255,255,0.1)';
        c.fillRect(cx + dir * 4 * s, by - 1 * s, 2 * s, 5 * s);
      } else {
        roundRect(c, cx - 11 * s, by - 2 * s, 5 * s, 7 * s, 2 * s); c.fill();
        roundRect(c, cx + 6 * s, by - 2 * s, 5 * s, 7 * s, 2 * s); c.fill();
        c.fillStyle = 'rgba(255,255,255,0.1)';
        c.fillRect(cx - 10 * s, by - 1 * s, 2 * s, 5 * s);
        c.fillRect(cx + 7 * s, by - 1 * s, 2 * s, 5 * s);
      }
      if (!isBack) { c.fillStyle = 'rgba(255,255,255,0.06)'; c.fillRect(cx - 3 * s, by - 2 * s, 6 * s, 10 * s); }
    }
    // Arms (front-facing & back: both arms; side: only front arm here)
    if (isSide) {
      c.fillStyle = armCol;
      c.save(); c.translate(cx + dir * 6 * s, by + 1 * s); c.rotate(-dir * (0.15 - armSwing));
      roundRect(c, -2 * s, 0, 4 * s, 9 * s, 2 * s); c.fill();
      c.fillStyle = col.skin; c.beginPath(); c.arc(0, 9 * s, 2 * s, 0, Math.PI * 2); c.fill();
      c.restore();
    } else {
      c.fillStyle = armCol;
      c.save(); c.translate(cx - 9 * s, by + 1 * s); c.rotate(-0.2 + armSwing);
      roundRect(c, -2 * s, 0, 4 * s, 9 * s, 2 * s); c.fill();
      c.fillStyle = col.skin; c.beginPath(); c.arc(0, 9 * s, 2 * s, 0, Math.PI * 2); c.fill();
      c.restore();
      c.fillStyle = armCol;
      c.save(); c.translate(cx + 9 * s, by + 1 * s); c.rotate(0.2 - armSwing);
      roundRect(c, -2 * s, 0, 4 * s, 9 * s, 2 * s); c.fill();
      c.fillStyle = col.skin; c.beginPath(); c.arc(0, 9 * s, 2 * s, 0, Math.PI * 2); c.fill();
      c.restore();
    }
    // Neck
    c.fillStyle = isBack ? col.hair : col.skin;
    c.fillRect(cx - 2 * s, by - 6 * s, 4 * s, 3 * s);
    // Head outline
    c.fillStyle = 'rgba(5,3,15,0.45)';
    c.beginPath(); c.arc(cx, by - 11 * s, 8 * s, 0, Math.PI * 2); c.fill();
    // Head
    c.fillStyle = isBack ? col.hair : col.skin;
    c.beginPath(); c.arc(cx, by - 11 * s, 7 * s, 0, Math.PI * 2); c.fill();
    if (isBack) {
      // Back of head: just hair coverage
      c.fillStyle = col.hair;
      c.beginPath(); c.arc(cx, by - 11 * s, 7 * s, 0, Math.PI * 2); c.fill();
      c.fillStyle = 'rgba(0,0,0,0.08)';
      c.beginPath(); c.arc(cx, by - 9 * s, 6 * s, 0, Math.PI); c.fill();
      if (col.short) {
        c.fillStyle = 'rgba(0,0,0,0.06)';
        c.fillRect(cx - 2 * s, by - 14 * s, 4 * s, 6 * s);
      } else {
        c.fillStyle = col.hair;
        c.fillRect(cx - 7 * s, by - 13 * s, 14 * s, 16 * s);
        c.fillStyle = 'rgba(0,0,0,0.06)';
        c.fillRect(cx - 2 * s, by - 13 * s, 4 * s, 15 * s);
      }
    } else {
      // Cheek (front/side)
      c.fillStyle = 'rgba(255,150,130,0.18)';
      if (isSide) {
        c.beginPath(); c.arc(cx + dir * 3 * s, by - 9 * s, 2 * s, 0, Math.PI * 2); c.fill();
      } else {
        c.beginPath(); c.arc(cx - 4 * s, by - 9 * s, 2 * s, 0, Math.PI * 2); c.fill();
        c.beginPath(); c.arc(cx + 4 * s, by - 9 * s, 2 * s, 0, Math.PI * 2); c.fill();
      }
      // Hair
      c.fillStyle = col.hair;
      if (col.short) {
        c.beginPath(); c.arc(cx, by - 13 * s, 7.5 * s, Math.PI, 0); c.fill();
        if (isSide) {
          c.fillRect(cx - dir * 6 * s, by - 14 * s, 4 * s, 5 * s);
          c.fillRect(cx - dir * 2 * s, by - 16 * s, 3 * s, 4 * s);
        } else {
          c.fillRect(cx - 6 * s, by - 14 * s, 3 * s, 5 * s);
          c.fillRect(cx - 1 * s, by - 16 * s, 3 * s, 4 * s);
          c.fillRect(cx + 3 * s, by - 14 * s, 3 * s, 4 * s);
        }
      } else {
        c.beginPath(); c.arc(cx, by - 13 * s, 7.5 * s, Math.PI, 0); c.fill();
        if (isSide) {
          c.fillRect(cx + dir * 4 * s, by - 13 * s, 3 * s, 14 * s);
        } else {
          c.fillRect(cx - 7 * s, by - 13 * s, 3 * s, 14 * s);
          c.fillRect(cx + 4 * s, by - 13 * s, 3 * s, 12 * s);
        }
      }
      c.fillStyle = 'rgba(255,255,255,0.1)';
      c.beginPath(); c.arc(cx - 1 * s, by - 15 * s, 3 * s, Math.PI, 0); c.fill();
    }
    // Helmet
    if (col.helmet) {
      c.fillStyle = col.helmet;
      c.beginPath(); c.arc(cx, by - 13 * s, 9 * s, Math.PI, 0); c.fill();
      if (isSide) {
        c.fillRect(cx - 9 * s, by - 12 * s, 18 * s, 4 * s);
        c.fillRect(cx + dir * 5 * s, by - 12 * s, 4 * s, 7 * s);
      } else {
        c.fillRect(cx - 9 * s, by - 12 * s, 3 * s, 7 * s);
        c.fillRect(cx + 6 * s, by - 12 * s, 3 * s, 7 * s);
      }
      c.fillStyle = 'rgba(255,255,255,0.12)';
      c.fillRect(cx - 7 * s, by - 13 * s, 14 * s, 1 * s);
      if (!isBack) {
        c.fillStyle = 'rgba(255,255,255,0.15)';
        c.beginPath(); c.arc(cx - 2 * s, by - 16 * s, 3 * s, Math.PI, 0); c.fill();
      }
      // Crest
      c.fillStyle = col.crest || '#ffd43b';
      if (isBack) {
        c.fillRect(cx - 1 * s, by - 22 * s, 2 * s, 7 * s);
      } else if (isSide) {
        c.fillRect(cx - 1 * s, by - 25 * s, 2.5 * s, 9 * s);
        c.fillRect(cx - 3 * s, by - 23 * s, 7 * s, 2 * s);
        c.beginPath(); c.moveTo(cx, by - 28 * s); c.lineTo(cx - 2 * s, by - 25 * s); c.lineTo(cx + 2 * s, by - 25 * s); c.closePath(); c.fill();
      } else {
        c.fillRect(cx - 1.5 * s, by - 25 * s, 3 * s, 9 * s);
        c.fillRect(cx - 4 * s, by - 23 * s, 8 * s, 2 * s);
        c.beginPath(); c.moveTo(cx, by - 28 * s); c.lineTo(cx - 2 * s, by - 25 * s); c.lineTo(cx + 2 * s, by - 25 * s); c.closePath(); c.fill();
      }
    }
    // Eyes (front, side, diagonal — not pure back)
    if (!isBack) {
      var ex = dir * 2, ey = fi.hy > 0 ? 1 : fi.isDiag ? -1 : 0;
      c.fillStyle = '#f0f0f0';
      if (isSide && !fi.isDiag) {
        c.fillRect(cx + dir * 1 * s + ex * s, by - 12.5 * s, 3.5 * s, 3 * s);
        c.fillStyle = '#1a0e05';
        c.fillRect(cx + dir * 2 * s + ex * s, by - 11.8 * s, 2 * s, 2 * s);
        c.fillStyle = '#fff';
        c.fillRect(cx + dir * 2.2 * s + ex * s, by - 12.2 * s, 1 * s, 1 * s);
        c.fillStyle = col.hair;
        c.fillRect(cx + dir * 1 * s + ex * s, by - 14 * s, 3.5 * s, 1 * s);
      } else {
        c.fillRect(cx - 4.5 * s + ex * s, by - 12.5 * s + ey * s, 3.5 * s, 3 * s);
        c.fillRect(cx + 1 * s + ex * s, by - 12.5 * s + ey * s, 3.5 * s, 3 * s);
        c.fillStyle = '#1a0e05';
        c.fillRect(cx - 3.2 * s + ex * s, by - 11.8 * s + ey * s, 2 * s, 2 * s);
        c.fillRect(cx + 1.5 * s + ex * s, by - 11.8 * s + ey * s, 2 * s, 2 * s);
        c.fillStyle = '#fff';
        c.fillRect(cx - 3 * s + ex * s, by - 12.2 * s + ey * s, 1 * s, 1 * s);
        c.fillRect(cx + 2 * s + ex * s, by - 12.2 * s + ey * s, 1 * s, 1 * s);
        c.fillStyle = col.hair;
        c.fillRect(cx - 4.5 * s + ex * s, by - 14 * s + ey * s, 3.5 * s, 1 * s);
        c.fillRect(cx + 1 * s + ex * s, by - 14 * s + ey * s, 3.5 * s, 1 * s);
      }
      // Mouth
      c.fillStyle = 'rgba(100,50,30,0.4)';
      var mx = isSide ? cx + dir * 2 * s : cx - 1.5 * s + ex * 0.5 * s;
      c.fillRect(mx, by - 7.5 * s, 3 * s, 1 * s);
    }
    // Head rim light
    c.fillStyle = 'rgba(255,240,200,0.1)';
    var rlx = isBack ? cx + 5 * s : cx - 5 * s;
    c.beginPath(); c.arc(rlx, by - 13 * s, 4 * s, 0, Math.PI * 2); c.fill();
  }
  function drawGhost(c, cx, cy, s) {
    var floatY = Math.sin(tick * 0.05) * 4 * s;
    var gy = cy + floatY;
    drawShadow(c, cx, cy, s * (0.85 - floatY * 0.015));
    // Outer aura
    var aura1 = c.createRadialGradient(cx, gy - 2 * s, 0, cx, gy - 2 * s, 24 * s);
    aura1.addColorStop(0, 'rgba(100,40,160,0.12)'); aura1.addColorStop(0.6, 'rgba(60,20,100,0.05)'); aura1.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = aura1; c.beginPath(); c.arc(cx, gy - 2 * s, 24 * s, 0, Math.PI * 2); c.fill();
    // Inner aura (pulsing)
    var pulse = 0.8 + Math.sin(tick * 0.08) * 0.2;
    var aura2 = c.createRadialGradient(cx, gy - 4 * s, 0, cx, gy - 4 * s, 14 * s * pulse);
    aura2.addColorStop(0, 'rgba(120,60,180,0.15)'); aura2.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = aura2; c.beginPath(); c.arc(cx, gy - 4 * s, 14 * s * pulse, 0, Math.PI * 2); c.fill();
    // Wispy tendrils
    c.fillStyle = 'rgba(50,40,70,0.25)';
    for (var t = 0; t < 4; t++) {
      var tx = cx + (t - 1.5) * 6 * s;
      var tw = Math.sin(tick * 0.06 + t * 1.5) * 3 * s;
      c.beginPath();
      c.moveTo(tx - 2 * s, gy + 8 * s);
      c.quadraticCurveTo(tx + tw, gy + 16 * s + Math.abs(tw), tx + tw * 0.5, gy + 22 * s);
      c.quadraticCurveTo(tx + 2 * s + tw * 0.3, gy + 16 * s, tx + 2 * s, gy + 8 * s);
      c.closePath(); c.fill();
    }
    // Main body
    c.fillStyle = '#3a3550';
    c.beginPath();
    c.moveTo(cx - 11 * s, gy + 10 * s);
    c.quadraticCurveTo(cx - 14 * s, gy - 6 * s, cx, gy - 16 * s);
    c.quadraticCurveTo(cx + 14 * s, gy - 6 * s, cx + 11 * s, gy + 10 * s);
    for (var i = 2; i >= -2; i--) {
      var wave = Math.sin(tick * 0.07 + i * 1.2) * 2 * s;
      c.lineTo(cx + i * 5 * s, gy + (i % 2 === 0 ? 6 * s : 11 * s) + wave);
    }
    c.closePath(); c.fill();
    // Body highlights
    c.fillStyle = '#4a4568';
    c.beginPath(); c.arc(cx - 2 * s, gy - 5 * s, 6 * s, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(90,70,120,0.3)';
    c.beginPath(); c.arc(cx + 3 * s, gy - 2 * s, 4 * s, 0, Math.PI * 2); c.fill();
    // Hood
    c.fillStyle = '#1a1528';
    c.beginPath(); c.arc(cx, gy - 12 * s, 9 * s, Math.PI, 0); c.fill();
    c.fillStyle = '#222';
    c.beginPath(); c.arc(cx, gy - 13 * s, 8 * s, Math.PI * 1.1, -0.1 * Math.PI); c.fill();
    // Eye glow
    c.save(); c.globalCompositeOperation = 'lighter';
    var eg = c.createRadialGradient(cx, gy - 9 * s, 0, cx, gy - 9 * s, 8 * s);
    eg.addColorStop(0, 'rgba(255,30,30,0.15)'); eg.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = eg; c.beginPath(); c.arc(cx, gy - 9 * s, 8 * s, 0, Math.PI * 2); c.fill();
    c.restore();
    // Eyes
    c.fillStyle = '#ff3333';
    c.fillRect(cx - 4.5 * s, gy - 10 * s, 3.5 * s, 2.5 * s);
    c.fillRect(cx + 1 * s, gy - 10 * s, 3.5 * s, 2.5 * s);
    c.fillStyle = '#ff8888';
    c.fillRect(cx - 3.5 * s, gy - 9.5 * s, 1.5 * s, 1.5 * s);
    c.fillRect(cx + 2 * s, gy - 9.5 * s, 1.5 * s, 1.5 * s);
    // Orbiting soul fragments
    for (var o = 0; o < 3; o++) {
      var ang = tick * 0.02 + o * Math.PI * 2 / 3;
      var ox = cx + Math.cos(ang) * 16 * s, oy = gy - 4 * s + Math.sin(ang) * 8 * s;
      c.globalAlpha = 0.4 + Math.sin(tick * 0.1 + o) * 0.2;
      c.fillStyle = '#8060c0';
      c.beginPath(); c.arc(ox, oy, 1.5 * s, 0, Math.PI * 2); c.fill();
    }
    c.globalAlpha = 1;
  }
  function drawActor(c, cx, cy, kind, facing, scale, moving, alpha) {
    scale = scale || 1;
    if (alpha != null && alpha < 1) { c.save(); c.globalAlpha = Math.max(0, alpha); }
    var sheet = HD_SPRITE[kind];
    if (sheet) {
      // スプライトシート描画（3列×4行）。足元を cy+TILE/2 付近に接地
      var cw = sheet.width / 3, chh = sheet.height / 4;
      var row = { down: 0, left: 1, right: 2, up: 3 }[facing || 'down'] || 0;
      var seq = [0, 1, 0, 2];
      var col = moving ? seq[(tick / 7 | 0) % 4] : 0;
      var dw = TILE * 1.15 * scale, dh = dw * (chh / cw);
      var footY = cy + (TILE / 2) * scale;
      c.fillStyle = 'rgba(0,0,0,0.22)';
      c.beginPath(); c.ellipse(cx, footY - 2, dw * 0.32, dw * 0.11, 0, 0, Math.PI * 2); c.fill();
      c.drawImage(sheet, col * cw, row * chh, cw, chh, cx - dw / 2, footY - dh, dw, dh);
    }
    else if (kind === 'enemy') { drawGhost(c, cx, cy, scale); }
    else { drawHumanoid(c, cx, cy, scale, PAL[kind] || PAL.oda, facing || 'down', moving); }
    if (alpha != null && alpha < 1) c.restore();
  }

  // ===================== Maps =====================
  const MUSEUM = [
    '################',
    '#..B...B...B...#',
    '#..............#',
    '#....K....S....#',
    '#..............#',
    '#..............#',
    '#......@.......#',
    '#..............#',
    '#..............#',
    '#..............#',
    '#..............#',
    '#..............#',
    '#..............#',
    '#######DD#######',
  ];
  const FIELD = [
    'TTTTTTTTTTTTTTTT',
    'T..............T',
    'T...T....T.....T',
    'T..............T',
    'T......i.......T',
    'T.....,,,......T',
    'T....,,m,,.....T',
    'T....,,,,,.....T',
    'T~~..,,,,,..~~~T',
    'T~~..,,,,,..~~~T',
    'T....,,,,,.....T',
    'T......@P......T',
    'T.....M........T',
    'TTTTTTTTTTTTTTTT',
  ];
  // ゾーンA: 長久手古戦場公園（40x28・カメラスクロール）
  // 実際の地理に寄せた配置: 公園の西に県道57号（縦の大通り）、その西にイオン。
  // 北辺にグリーンロード（横の大通り）とリニモ古戦場駅（北東）。
  // W/^=記念館外観, D=記念館入口, M=勝入塚, N=庄九郎塚, R=岩, b=茂み, P=セーブ篝火
  const ZONEA = [
    'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT..TTTT',
    'T....rrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrT',
    'T....rrr............^^^^^^^^^^^^^..eee.T',
    'TIII.rrr............^^^^^^^^^^^^^......T',
    'TII4.rrr............WWWWWWWWWWWWW......T',
    'TIII.rrr............WWWWWWWWWWWWW......T',
    'T....rrr............WWWWWDDWWWWWW......T',
    'T....rrr.................,,............T',
    'T....rrr.................,,............T',
    'T....rrr.bbb.............,,............T',
    'T....rrr.bbb.............,,.......M....T',
    'T....rrr.bbb.R...........,,............T',
    'T....rrr.................,,....N.......T',
    'rrrrrrrr...............................T',
    'rrrrrrrr...............................T',
    'T....rrr...............................T',
    'T....rrr...........................~~~.T',
    'T....rrr...........................~~~.T',
    'T....rrr...............................T',
    'T....rrr....................P..........T',
    'T....rrr...............................T',
    'T....rrr...............................T',
    'T....rrr...............................T',
    'T....rrr...............................T',
    'T....rrr...........@...................T',
    'T....rrr..T..............T....T........T',
    'T....rrr...............................T',
    'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
  ];
  // ゾーンB: 市街地（グリーンロード・砂子交差点・一蘭・桧ヶ根公園・御旗山）
  // 御旗山は実際には古戦場公園の南西 → 南東エリア（N）に配置
  const ZONEB = [
    'TTTTTTTTTTTTTTTTTTT..TTTTTTTTTTTTTTTTTTT',
    'T..................rrr.................T',
    'T..................rrr.................T',
    'T..................rrr.................T',
    'T..................rrr.................T',
    'T..................rrr.................T',
    'T..................rrr.................T',
    'T..................rrr.................T',
    'T..................rrr.................T',
    'T..................rrr..YYYYY..........T',
    'T..................rrr..YYYYY..........T',
    'T..................rrr..Y11YY..........T',
    'T..................rrr.................T',
    'Trrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr',
    'Trrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr',
    'TrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrT',
    'T..................rrr.................T',
    'T..................rrr.................T',
    'T..................rrr.................T',
    'T...bTb............rrr.................T',
    'T...b.b............rrr........N........T',
    'T...b.a.b..........rrr.................T',
    'T...b.b............rrr.................T',
    'T...bbb............rrr.................T',
    'T..................rrr.................T',
    'T..................rrr.................T',
    'T..................rrr.................T',
    'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
  ];
  // ゾーンC: 岩作・色金山（色金山＋床机石・茶室・市役所・こども塾・血の池・安昌寺・武蔵塚）
  // 安昌寺は実際には色金山のすぐ西 → 山の西隣（J＋o）に配置。御旗山はゾーンBへ移設
  const ZONEC = [
    'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
    'T......................................T',
    'T...........TTTTTTTT,TTTTTTTT..........T',
    'T...........TTTTTTTT,TTTTTTTT..........T',
    'T...........TTTTTT..R..TTTTTT..........T',
    'T...........TTTTTT..,..TTTTTT..........T',
    'T...........TTTTTT..,..TTTTTT..........T',
    'T...........TTTTTT..,..TTTTTT..........T',
    'T...JJJJJ..........,,..................T',
    'T...JJJJJ..........,,...x..............T',
    'T...JJJJJ......JJJJJ,..................T',
    'T.....o........JJJJJ,..................T',
    'T..............JJ1JJ,....WWWWWW........T',
    '....................,....WWWWWW........T',
    '....................,....WWWWWW........T',
    'T...................,....WW2WWW........T',
    'T...................,..................T',
    'T.......~~~~~.......,..................T',
    'T.......~~~~~.......,...........KKKKK..T',
    'T.......~~~~~.......,...........KKKKK..T',
    'T.......a...........,...........KK3KK..T',
    'T...................,...M..............T',
    'T...................,..................T',
    'T...................,..................T',
    'T...................,..................T',
    'T...................,..................T',
    'T......................................T',
    'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT..TTTT',
  ];
  // ゾーンD: 文化の家周辺（文化の家・中央図書館）
  const ZONED = [
    'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
    'T......................................T',
    'T......................................T',
    'T......................................T',
    'T......................................T',
    'T......................................T',
    'T...........^^^^^^^^^^^^^^^^...........T',
    'T...........^^^^^^^^^^^^^^^^...........T',
    'T...........^^^^^^^^^^^^^^^^...........T',
    'T...........FFFFFFFFFFFFFFFF...........T',
    'T...........FFFFFFFFFFFFFFFF...........T',
    'T...........FFFFFFFFFFFFFFFF...........T',
    'T...........FFFFFFF11FFFFFFF...........T',
    'T.......................................',
    'T.......................................',
    'T......................................T',
    'T......................................T',
    'T.............................LLLLLLL..T',
    'T.............................LLLLLLL..T',
    'T.............................LLLLLLL..T',
    'T.............................LLL2LLL..T',
    'T......................................T',
    'T......................................T',
    'T......................................T',
    'T......................................T',
    'T......................................T',
    'T......................................T',
    'TTTTTTTTTTTTTTTTTTT..TTTTTTTTTTTTTTTTTTT',
  ];
  // ゾーンE: モリコロパーク（リニモでのみ来園）
  const ZONEE = [
    'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
    'T......................................T',
    'T......................................T',
    'T...............................OOOO...T',
    'T...............................OOOO...T',
    'T...............................OOOO...T',
    'T...............................OOOO...T',
    'T......................................T',
    'T......................................T',
    'T.........p............................T',
    'T...........................q..........T',
    'T......................................T',
    'T.............~~~~~~~~~~~..............T',
    'T.............~~~~~~~~~~~..............T',
    'T.............~~~~~~~~~~~..............T',
    'T.............~~~~~~~~~~~..............T',
    'T.............~~~~~~~~~~~..............T',
    'T.............~~~~~~~~~~~..............T',
    'T......................................T',
    'T......................................T',
    'T.eee..................................T',
    'T...................u..................T',
    'T......................................T',
    'T......................................T',
    'T......................................T',
    'T....T....T.............T....T.........T',
    'T......................................T',
    'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
  ];
  // 文化の家・屋内（1階ガレリア / 2階 / 森のホール）
  const BUNKA1 = [
    '################',
    '#U............V#',
    '#..............#',
    '#..............#',
    '#..............#',
    '#..............#',
    '#......@.......#',
    '#..............#',
    '#..............#',
    '#..............#',
    '#..............#',
    '#..............#',
    '#..............#',
    '#######DD#######',
  ];
  const BUNKA2 = [
    '################',
    '#U.............#',
    '#..............#',
    '#..............#',
    '#..............#',
    '#..............#',
    '#......@.......#',
    '#..............#',
    '#..............#',
    '#..............#',
    '#..............#',
    '#..............#',
    '#..............#',
    '################',
  ];
  const MORIHALL = [
    '################',
    '#==============#',
    '#==============#',
    '#..............#',
    '#.......s......#',
    '#..............#',
    '#......@.......#',
    '#..............#',
    '#..............#',
    '#..............#',
    '#..............#',
    '#..............#',
    '#..............#',
    '#######DD#######',
  ];
  // マップレジストリ。新マップは rows＋この定義を追加するだけで動く。
  //  kind: outdoor はカメラスクロール対象（画面より大きい場合）、indoor は固定画面
  //  tileset: drawTile の描画スタイル（museum / outdoor。将来 mall / library 等を追加）
  //  solid: 通行不可文字、npcs: NPC文字→{kind,id,floor}、acts: アクション文字→ID
  //  encounter: { rate } でエンカウント有効（null なら無効）
  const MAP_DEFS = {
    museum: {
      rows: MUSEUM, kind: 'indoor', tileset: 'museum', playerFloor: '.',
      solid: ['#', 'B', 'K', 'S', 'D'],
      npcs: {},
      acts: { B: 'byobu', K: 'katchu', S: 'katana', D: 'museum_exit', P: 'save' },
      encounter: null,
    },
    field: {
      rows: FIELD, kind: 'outdoor', tileset: 'outdoor', playerFloor: ',',
      solid: ['T', '~', 'M', 'P'],
      npcs: { i: { kind: 'ike', id: 'ike', floor: '.' }, m: { kind: 'michi', id: 'michi', floor: ',' } },
      acts: { M: 'mound', P: 'save' },
      encounter: { rate: 0.07 },
    },
    zoneA: {
      rows: ZONEA, kind: 'outdoor', tileset: 'outdoor', playerFloor: '.',
      solid: ['T', '~', 'M', 'N', 'R', 'b', 'W', '^', 'D', 'P', 'I', '4', 'e'],
      npcs: {},
      acts: { M: 'mound', N: 'shokuro', R: 'rock', D: 'museum_enter', P: 'save', 4: 'aeon', e: 'station' },
      edges: { west: 'zoneB', north: 'zoneC' },
      encounter: null,
    },
    zoneB: {
      rows: ZONEB, kind: 'outdoor', tileset: 'outdoor', playerFloor: '.',
      solid: ['T', 'b', 'Y', '1', 'N'],
      npcs: {},
      acts: { 1: 'ramen', a: 'higane', N: 'site_mihata' },
      edges: { east: 'zoneA', north: 'zoneD' },
      encounter: null,
    },
    zoneC: {
      rows: ZONEC, kind: 'outdoor', tileset: 'outdoor', playerFloor: '.',
      solid: ['T', '~', 'M', 'N', 'R', 'J', 'W', 'K', '1', '2', '3', 'x'],
      npcs: {},
      acts: { R: 'site_irogane', 1: 'tearoom', 2: 'cityhall', 3: 'kodomo', a: 'site_chinoike', o: 'site_ansho', M: 'site_musashi', x: 'shateki' },
      edges: { south: 'zoneA', west: 'zoneD' },
      encounter: null,
    },
    zoneD: {
      rows: ZONED, kind: 'outdoor', tileset: 'outdoor', playerFloor: '.',
      solid: ['T', 'F', '^', 'L', '1', '2'],
      npcs: {},
      acts: { 1: 'bunka_in', 2: 'library' },
      edges: { east: 'zoneC', south: 'zoneB' },
      encounter: null,
    },
    zoneE: {
      rows: ZONEE, kind: 'outdoor', tileset: 'outdoor', playerFloor: '.',
      solid: ['T', '~', 'O', 'e'],
      npcs: {
        p: { kind: 'civ1', id: 'expo1', floor: '.' },
        q: { kind: 'civ2', id: 'expo2', floor: '.' },
        u: { kind: 'civ1', id: 'expo3', floor: '.' },
      },
      acts: { e: 'station', O: 'wheel' },
      encounter: null,
    },
    bunka1: {
      rows: BUNKA1, kind: 'indoor', tileset: 'museum', playerFloor: '.',
      solid: ['#', 'D', 'U', 'V'],
      npcs: {},
      acts: { D: 'bunka_exit', U: 'bunka_up', V: 'mori_in' },
      encounter: null,
    },
    bunka2: {
      rows: BUNKA2, kind: 'indoor', tileset: 'museum', playerFloor: '.',
      solid: ['#', 'U'],
      npcs: {},
      acts: { U: 'bunka_down' },
      encounter: null,
    },
    mori: {
      rows: MORIHALL, kind: 'indoor', tileset: 'museum', playerFloor: '.',
      solid: ['#', 'D', '='],
      npcs: { s: { kind: 'sakamoto', id: 'sakamoto', floor: '.' } },
      acts: { D: 'mori_exit', '=': 'drumcircle' },
      encounter: null,
    },
  };
  // ゾーン端のシームレス接続が解放されているか（四章の現地取材クエスト以降）
  function omakeUnlocked() {
    return (chapter === 'main2' && stageP3 >= 1) || chapter === 'post';
  }
  // 現地取材クエスト（四章: 戦トークの仕込み）の対象5史跡
  const JUNBI_SITES = ['irogane', 'mihata', 'chinoike', 'musashi', 'ansho'];
  function junbiCleared() {
    for (var i = 0; i < JUNBI_SITES.length; i++) if (!tourCleared.has(JUNBI_SITES[i])) return false;
    return true;
  }
  function junbiCount() {
    var n = 0;
    for (var i = 0; i < JUNBI_SITES.length; i++) if (tourCleared.has(JUNBI_SITES[i])) n++;
    return n;
  }
  function parseMap(key) {
    const def = MAP_DEFS[key];
    const grid = def.rows.map(function (r) { return r.split(''); });
    let spawn = { col: 1, row: 1 };
    const npcs = [];
    const acts = {};
    for (let row = 0; row < grid.length; row++) {
      for (let col = 0; col < grid[row].length; col++) {
        const ch = grid[row][col];
        if (ch === '@') { spawn = { col: col, row: row }; grid[row][col] = def.playerFloor; }
        else if (def.npcs[ch]) { const nd = def.npcs[ch]; npcs.push({ col: col, row: row, kind: nd.kind, id: nd.id }); grid[row][col] = nd.floor; }
        else if (def.acts[ch]) acts[col + ',' + row] = def.acts[ch];
      }
    }
    return {
      key: key, def: def, grid: grid, spawn: spawn, npcs: npcs, acts: acts,
      solid: new Set(def.solid), tileset: def.tileset, kind: def.kind,
      pxW: grid[0].length * TILE, pxH: grid.length * TILE,
    };
  }

  // ===================== Tile rendering =====================
  function drawTile(c, ch, x, y, key) {
    const T = TILE;
    var tc = x / T | 0, tr = y / T | 0;
    var h0 = tileHash(tc, tr, 0), h1 = tileHash(tc, tr, 1), h2 = tileHash(tc, tr, 2);
    if (key === 'museum') {
      fillSmooth(c, tc, tr, x, y, function(v) {
        var wb = 180 + v * 35 | 0;
        return 'rgb(' + (wb + 30) + ',' + (wb + 8) + ',' + (wb - 35) + ')';
      });
      c.strokeStyle = 'rgba(100,70,30,0.035)'; c.lineWidth = 1;
      c.beginPath(); c.moveTo(x, y + 6 + h0 * 8); c.lineTo(x + T, y + 7 + h2 * 7); c.stroke();
      c.beginPath(); c.moveTo(x, y + T - 7 - h1 * 6); c.lineTo(x + T, y + T - 6 - h2 * 5); c.stroke();
      if (ch === '#') {
        fillSmooth(c, tc, tr, x, y, function(v) {
          var bk = 78 + v * 18 | 0;
          return 'rgb(' + bk + ',' + (bk - 12) + ',' + (bk - 22) + ')';
        });
        // Brick pattern
        var boff = (tr % 2 === 0) ? 0 : T / 2;
        c.strokeStyle = 'rgba(30,20,10,0.3)'; c.lineWidth = 1;
        c.beginPath(); c.moveTo(x, y + T / 2); c.lineTo(x + T, y + T / 2); c.stroke();
        c.beginPath(); c.moveTo(x + boff, y); c.lineTo(x + boff, y + T / 2); c.stroke();
        c.beginPath(); c.moveTo(x + boff + T / 2, y + T / 2); c.lineTo(x + boff + T / 2, y + T); c.stroke();
        // Brick shading
        c.fillStyle = 'rgba(0,0,0,0.1)'; c.fillRect(x, y, T, 2);
        c.fillStyle = 'rgba(120,100,70,0.06)'; c.fillRect(x, y + T / 2 - 2, T, 2);
        c.fillStyle = 'rgba(150,130,100,0.05)'; c.fillRect(x + 1, y + 2, T - 2, 1);
      } else if (ch === 'B') {
        c.fillStyle = '#8a6a2a'; c.fillRect(x + 1, y + T - 5, T - 2, 5);
        c.fillStyle = '#d4a84a'; c.fillRect(x + 2, y + 3, T - 4, T - 9);
        c.fillStyle = 'rgba(255,220,100,0.25)'; c.fillRect(x + 3, y + 4, (T - 6) * h0, T - 14);
        c.strokeStyle = '#7a5b1e'; c.lineWidth = 1;
        for (var bi = 1; bi < 3; bi++) { c.beginPath(); c.moveTo(x + 2 + bi * (T - 4) / 3, y + 3); c.lineTo(x + 2 + bi * (T - 4) / 3, y + T - 6); c.stroke(); }
        c.fillStyle = '#5a3a10'; c.fillRect(x + 2, y + 3, T - 4, 2);
      } else if (ch === 'K') {
        c.fillStyle = '#3a3a3a'; c.fillRect(x + T / 2 - 2, y + T - 8, 4, 8);
        c.fillStyle = '#495057'; roundRect(c, x + 7, y + 5, T - 14, T - 12, 4); c.fill();
        c.fillStyle = '#5c636a'; c.fillRect(x + 5, y + 8, 4, 7); c.fillRect(x + T - 9, y + 8, 4, 7);
        c.fillStyle = '#868e96'; c.beginPath(); c.arc(x + T / 2, y + 8, 5, 0, Math.PI * 2); c.fill();
        c.fillStyle = 'rgba(255,255,255,0.15)'; c.beginPath(); c.arc(x + T / 2 - 1, y + 7, 2.5, 0, Math.PI * 2); c.fill();
      } else if (ch === 'S') {
        c.fillStyle = '#5a3a1a'; c.fillRect(x + 3, y + T - 10, T - 6, 3);
        c.fillStyle = '#4a2a0a'; c.fillRect(x + 5, y + T - 13, 3, 5); c.fillRect(x + T - 8, y + T - 13, 3, 5);
        c.strokeStyle = '#d8dce0'; c.lineWidth = 2.5;
        c.beginPath(); c.moveTo(x + 6, y + T - 9); c.quadraticCurveTo(x + T / 2, y + 4, x + T - 6, y + T - 9); c.stroke();
        c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 1;
        c.beginPath(); c.moveTo(x + 8, y + T - 8); c.quadraticCurveTo(x + T / 2, y + 6, x + T - 8, y + T - 8); c.stroke();
      } else if (ch === 'D') {
        c.fillStyle = '#7a5a30'; c.fillRect(x, y, T, T);
        c.fillStyle = '#6a4a20'; c.fillRect(x + 3, y + 2, T - 6, T - 4);
        c.fillStyle = '#8a6a3b'; c.fillRect(x + 3, y + T / 2 - 1, T - 6, 2); c.fillRect(x + T / 2 - 1, y + 2, 2, T - 4);
        c.fillStyle = '#d4aa40'; c.beginPath(); c.arc(x + T - 8, y + T / 2, 2.5, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#f0c850'; c.beginPath(); c.arc(x + T - 8.5, y + T / 2 - 0.5, 1, 0, Math.PI * 2); c.fill();
      } else if (ch === 'U') {
        // 階段
        c.fillStyle = '#4a5058'; c.fillRect(x + 2, y + 2, T - 4, T - 4);
        for (var st2 = 0; st2 < 4; st2++) {
          c.fillStyle = st2 % 2 === 0 ? '#6b7280' : '#5a626b';
          c.fillRect(x + 4, y + 4 + st2 * 6, T - 8, 5);
        }
        c.fillStyle = '#ffd43b'; c.font = 'bold 10px sans-serif'; c.fillText('2F', x + T / 2 - 6, y + T - 5);
      } else if (ch === 'V') {
        // 森のホールへの扉（赤）
        c.fillStyle = '#7a2a30'; c.fillRect(x, y, T, T);
        c.fillStyle = '#8e3540'; c.fillRect(x + 3, y + 2, T - 6, T - 4);
        c.fillStyle = '#d4aa40'; c.beginPath(); c.arc(x + T - 9, y + T / 2, 2.5, 0, Math.PI * 2); c.fill();
        c.fillStyle = 'rgba(255,255,255,0.12)'; c.fillRect(x + 4, y + 3, 3, T - 6);
      } else if (ch === '=') {
        // ホールのステージ
        c.fillStyle = '#3b2a20'; c.fillRect(x, y, T, T);
        c.fillStyle = '#4d3828'; c.fillRect(x, y + 2, T, T - 8);
        c.fillStyle = 'rgba(255,220,150,0.08)'; c.fillRect(x, y + 4, T, 4);
        c.fillStyle = '#2a1c14'; c.fillRect(x, y + T - 4, T, 4);
      }
    } else {
      // HD-2D: 地面テクスチャがあればパターン敷き、無ければ従来のプロシージャル
      var gpat = hdPattern(c, 'grass');
      if (gpat) { c.fillStyle = gpat; c.fillRect(x, y, T, T); }
      else fillSmooth(c, tc, tr, x, y, function(v) {
        var gb = 74 + v * 22 | 0, gg = 140 + v * 28 | 0;
        return 'rgb(' + gb + ',' + gg + ',' + (gb - 8) + ')';
      });
      if (ch === ',') {
        var dpat = hdPattern(c, 'dirt');
        if (dpat) { c.fillStyle = dpat; c.fillRect(x, y, T, T); return; }
        fillSmooth(c, tc, tr, x, y, function(v) {
          var pb = 175 + v * 20 | 0;
          return 'rgb(' + (pb + 10) + ',' + (pb - 10) + ',' + (pb - 50) + ')';
        });
        // Stone-like variation
        c.fillStyle = 'rgba(140,120,80,0.08)';
        c.fillRect(x + h0 * 12 + 2, y + h1 * 10 + 2, 12 + h2 * 6, 8 + h0 * 4);
        c.fillStyle = 'rgba(200,180,140,0.06)';
        c.fillRect(x + h2 * 10 + 6, y + h0 * 8 + 8, 8 + h1 * 5, 6 + h2 * 3);
        // Subtle cracks
        c.strokeStyle = 'rgba(80,60,30,0.1)'; c.lineWidth = 0.5;
        c.beginPath(); c.moveTo(x + h0 * 20 + 3, y + h1 * 12); c.lineTo(x + h0 * 20 + 8, y + h1 * 12 + 7); c.stroke();
        // Pebbles
        c.fillStyle = 'rgba(70,50,25,0.12)';
        c.beginPath(); c.arc(x + h0 * 18 + 5, y + h1 * 16 + 6, 1.5, 0, Math.PI * 2); c.fill();
        c.beginPath(); c.arc(x + h2 * 14 + 10, y + h0 * 12 + 15, 1, 0, Math.PI * 2); c.fill();
        if (h1 > 0.7) { c.fillStyle = 'rgba(80,120,50,0.12)'; c.fillRect(x + h0 * 4, y + h2 * 6, 4, T - h2 * 8); }
      } else if (ch === '.') {
        if (gpat) return; // テクスチャに草のディテールが含まれるため加飾しない
        c.fillStyle = 'rgba(100,190,70,0.07)'; c.fillRect(x + h1 * 10 + 2, y + h2 * 8 + 2, 10, 8);
        var wind = Math.sin(tick * 0.025 + tc * 0.8 + tr * 0.6);
        c.strokeStyle = 'rgba(30,95,20,0.35)'; c.lineWidth = 1;
        for (var gi = 0; gi < 5; gi++) {
          var gx = x + tileHash(tc, tr, gi + 20) * (T - 6) + 3;
          var gy2 = y + tileHash(tc, tr, gi + 30) * (T - 8) + 4;
          var gh = 4 + tileHash(tc, tr, gi + 40) * 3;
          var gw = wind * (1.5 + tileHash(tc, tr, gi + 50) * 2);
          c.beginPath(); c.moveTo(gx, gy2 + gh); c.quadraticCurveTo(gx + gw * 0.5, gy2 + gh * 0.4, gx + gw, gy2); c.stroke();
        }
        c.lineWidth = 1;
        if (h0 > 0.78) {
          c.fillStyle = h1 > 0.5 ? '#f06595' : '#ffd43b';
          c.beginPath(); c.arc(x + h1 * 20 + 5, y + h2 * 18 + 6, 1.5, 0, Math.PI * 2); c.fill();
          c.fillStyle = h1 > 0.5 ? '#ff85a5' : '#ffee66';
          c.beginPath(); c.arc(x + h1 * 20 + 5, y + h2 * 18 + 6, 0.8, 0, Math.PI * 2); c.fill();
        }
      } else if (ch === 'T') {
        var tw = Math.sin(tick * 0.02 + tc * 1.1 + tr * 0.7) * 1.2;
        var cx = x + T / 2, cy = y + T / 2 - 2;
        // Ground shadow
        c.fillStyle = 'rgba(0,0,0,0.18)';
        c.beginPath(); c.ellipse(cx + 1, y + T - 2, 11, 4, 0, 0, Math.PI * 2); c.fill();
        // Trunk
        c.fillStyle = '#4a2c12'; c.fillRect(cx - 3, cy + 4, 6, T / 2 + 2);
        c.fillStyle = '#3a1e0a'; c.fillRect(cx - 1, cy + 4, 1, T / 2 + 2); c.fillRect(cx + 2, cy + 5, 1, T / 2);
        c.fillStyle = '#6a4522'; c.fillRect(cx + 2, cy + 6, 1, T / 2 - 3);
        // Root flare
        c.fillStyle = '#4a2c12';
        c.fillRect(cx - 5, y + T - 4, 3, 3); c.fillRect(cx + 3, y + T - 3, 3, 2);
        // Canopy leaf clusters (back layer - dark)
        c.fillStyle = '#1a5518';
        c.beginPath(); c.arc(cx - 5 + tw * 0.3, cy - 2, 8, 0, Math.PI * 2); c.fill();
        c.beginPath(); c.arc(cx + 6 + tw * 0.5, cy - 1, 7, 0, Math.PI * 2); c.fill();
        c.beginPath(); c.arc(cx + tw * 0.2, cy - 6, 9, 0, Math.PI * 2); c.fill();
        // Middle layer
        c.fillStyle = '#276d24';
        c.beginPath(); c.arc(cx - 3 + tw * 0.4, cy - 3, 7, 0, Math.PI * 2); c.fill();
        c.beginPath(); c.arc(cx + 4 + tw * 0.6, cy - 2, 6, 0, Math.PI * 2); c.fill();
        c.beginPath(); c.arc(cx + tw * 0.3, cy - 5, 8, 0, Math.PI * 2); c.fill();
        // Front layer - bright
        c.fillStyle = '#3d9b36';
        c.beginPath(); c.arc(cx - 2 + tw * 0.5, cy - 5, 5, 0, Math.PI * 2); c.fill();
        c.beginPath(); c.arc(cx + 3 + tw * 0.4, cy - 4, 4.5, 0, Math.PI * 2); c.fill();
        // Highlight clusters
        c.fillStyle = 'rgba(110,210,80,0.3)';
        c.beginPath(); c.arc(cx - 1 + tw * 0.5, cy - 7, 3.5, 0, Math.PI * 2); c.fill();
        c.fillStyle = 'rgba(160,240,100,0.15)';
        c.beginPath(); c.arc(cx - 2 + tw * 0.3, cy - 8, 2.5, 0, Math.PI * 2); c.fill();
        // Bottom shadow edge
        c.fillStyle = 'rgba(10,40,10,0.2)';
        c.beginPath(); c.arc(cx, cy + 4, 10, 0, Math.PI); c.fill();
      } else if (ch === '~') {
        var wpat = hdPattern(c, 'water');
        if (wpat) { c.fillStyle = wpat; c.fillRect(x, y, T, T); }
        else fillSmooth(c, tc, tr, x, y, function(v) {
          return 'rgb(' + (22 + v * 8 | 0) + ',' + (84 + v * 12 | 0) + ',' + (146 + v * 16 | 0) + ')';
        });
        var wt = tick * 0.06;
        c.fillStyle = 'rgba(100,200,255,0.07)';
        var wcx = x + T / 2 + Math.sin(wt + tc) * 8, wcy = y + T / 2 + Math.cos(wt + tr) * 6;
        c.beginPath(); c.arc(wcx, wcy, 6, 0, Math.PI * 2); c.fill();
        c.strokeStyle = 'rgba(180,230,255,0.3)'; c.lineWidth = 1;
        for (var wi = 0; wi < 3; wi++) {
          var wy = y + 5 + wi * 9, wp = wt + wi * 1.5 + tc * 0.4;
          c.beginPath(); c.moveTo(x, wy + Math.sin(wp) * 2);
          c.quadraticCurveTo(x + T * 0.33, wy + Math.sin(wp + 1) * 2, x + T * 0.66, wy + Math.sin(wp + 2) * 2);
          c.lineTo(x + T, wy + Math.sin(wp + 3) * 2); c.stroke();
        }
        if ((tick + tc * 7 + tr * 13) % 35 < 5) {
          c.fillStyle = 'rgba(255,255,255,0.6)';
          c.beginPath(); c.arc(x + h0 * 18 + 5, y + h1 * 16 + 5, 1.5, 0, Math.PI * 2); c.fill();
        }
        c.lineWidth = 1;
      } else if (ch === 'M') {
        c.fillStyle = '#7a5a3a'; c.beginPath(); c.arc(x + T / 2, y + T - 3, 12, Math.PI, 0); c.fill();
        c.fillStyle = '#5a4020'; c.beginPath(); c.arc(x + T / 2 + 2, y + T - 3, 7, Math.PI, 0); c.fill();
        c.fillStyle = '#8a8a8a'; c.fillRect(x + T / 2 - 2, y + 5, 4, 10);
        c.fillStyle = '#aaa'; c.fillRect(x + T / 2 - 4, y + 4, 8, 3);
        c.fillStyle = 'rgba(255,255,255,0.12)'; c.fillRect(x + T / 2 - 3, y + 5, 2, 8);
      } else if (ch === 'P') {
        // Stone base
        c.fillStyle = '#3a2e1e'; c.beginPath(); c.ellipse(x + T / 2, y + T - 4, 8, 4, 0, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#4a3a28'; c.beginPath(); c.ellipse(x + T / 2, y + T - 5, 7, 3.5, 0, 0, Math.PI * 2); c.fill();
        c.fillStyle = 'rgba(255,200,100,0.08)'; c.beginPath(); c.ellipse(x + T / 2, y + T - 5.5, 5, 2.5, 0, 0, Math.PI * 2); c.fill();
        // Stake
        c.fillStyle = '#5a3f22'; c.fillRect(x + T / 2 - 2, y + 10, 4, T - 16);
        c.fillStyle = '#6b4f2a'; c.fillRect(x + T / 2 - 1, y + 10, 2, T - 16);
        c.fillStyle = '#4a2e14'; c.fillRect(x + T / 2 + 1, y + 11, 1, T - 18);
        // Multi-layer fire
        var ft = tick * 0.15, fl = Math.sin(ft) * 2, fl2 = Math.sin(ft * 1.3 + 1) * 1.5;
        // Glow halo
        c.save(); c.globalCompositeOperation = 'lighter';
        var fg = c.createRadialGradient(x + T / 2, y + 9, 0, x + T / 2, y + 9, 16);
        fg.addColorStop(0, 'rgba(255,160,40,0.12)'); fg.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = fg; c.beginPath(); c.arc(x + T / 2, y + 9, 16, 0, Math.PI * 2); c.fill();
        c.restore();
        // Outer flame
        c.fillStyle = '#cc4400'; c.beginPath(); c.moveTo(x + T / 2 + fl * 0.5, y + 2 + fl); c.quadraticCurveTo(x + T / 2 - 7, y + 10, x + T / 2 - 5, y + 16); c.lineTo(x + T / 2 + 5, y + 16); c.quadraticCurveTo(x + T / 2 + 7, y + 10, x + T / 2 + fl * 0.5, y + 2 + fl); c.fill();
        // Mid flame
        c.fillStyle = '#ff8800'; c.beginPath(); c.moveTo(x + T / 2 + fl2 * 0.4, y + 4 + fl); c.quadraticCurveTo(x + T / 2 - 5, y + 11, x + T / 2 - 3, y + 16); c.lineTo(x + T / 2 + 3, y + 16); c.quadraticCurveTo(x + T / 2 + 5, y + 11, x + T / 2 + fl2 * 0.4, y + 4 + fl); c.fill();
        // Inner bright
        c.fillStyle = '#ffcc33'; c.beginPath(); c.moveTo(x + T / 2, y + 7 + fl * 0.5); c.quadraticCurveTo(x + T / 2 - 3, y + 13, x + T / 2 - 2, y + 15); c.lineTo(x + T / 2 + 2, y + 15); c.quadraticCurveTo(x + T / 2 + 3, y + 13, x + T / 2, y + 7 + fl * 0.5); c.fill();
        // Core white-hot
        c.fillStyle = '#ffe880'; c.beginPath(); c.ellipse(x + T / 2, y + 13, 1.5, 2, 0, 0, Math.PI * 2); c.fill();
        // Sparks
        for (var si = 0; si < 2; si++) {
          var sp = (tick * 0.3 + si * 3 + tc * 7) % 12;
          if (sp < 6) { c.fillStyle = 'rgba(255,200,60,0.7)'; c.fillRect(x + T / 2 - 4 + Math.sin(ft * 2 + si * 2) * 5, y + 2 - sp, 1, 1); }
        }
      } else if (ch === 'R') {
        // 岩
        c.fillStyle = 'rgba(0,0,0,0.2)'; c.beginPath(); c.ellipse(x + T / 2, y + T - 4, 13, 5, 0, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#8a8f96'; c.beginPath(); c.ellipse(x + T / 2, y + T / 2 + 2, 12, 10, 0, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#a5abb3'; c.beginPath(); c.ellipse(x + T / 2 - 3, y + T / 2 - 1, 8, 6, -0.3, 0, Math.PI * 2); c.fill();
        c.fillStyle = 'rgba(255,255,255,0.25)'; c.beginPath(); c.ellipse(x + T / 2 - 5, y + T / 2 - 4, 3.5, 2.2, -0.3, 0, Math.PI * 2); c.fill();
        c.strokeStyle = 'rgba(50,55,60,0.4)'; c.lineWidth = 1;
        c.beginPath(); c.moveTo(x + T / 2 + 2, y + T / 2 - 3); c.lineTo(x + T / 2 + 7, y + T / 2 + 4); c.stroke();
      } else if (ch === 'b') {
        // 茂み
        c.fillStyle = 'rgba(0,0,0,0.15)'; c.beginPath(); c.ellipse(x + T / 2, y + T - 4, 13, 4, 0, 0, Math.PI * 2); c.fill();
        var bw2 = Math.sin(tick * 0.02 + tc * 1.3 + tr) * 1;
        c.fillStyle = '#1d5c1d';
        c.beginPath(); c.arc(x + 9 + bw2 * 0.4, y + T - 12, 8, 0, Math.PI * 2); c.fill();
        c.beginPath(); c.arc(x + T - 9 + bw2 * 0.6, y + T - 11, 8, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#2d7a2d';
        c.beginPath(); c.arc(x + T / 2 + bw2 * 0.5, y + T - 15, 9, 0, Math.PI * 2); c.fill();
        c.fillStyle = 'rgba(120,220,90,0.25)';
        c.beginPath(); c.arc(x + T / 2 - 2 + bw2 * 0.5, y + T - 18, 4, 0, Math.PI * 2); c.fill();
      } else if (ch === 'N') {
        // 庄九郎塚（勝入塚より小ぶり・木の立て札）
        c.fillStyle = '#74563a'; c.beginPath(); c.arc(x + T / 2, y + T - 3, 11, Math.PI, 0); c.fill();
        c.fillStyle = '#57401f'; c.beginPath(); c.arc(x + T / 2 + 2, y + T - 3, 6, Math.PI, 0); c.fill();
        c.fillStyle = '#7a5a30'; c.fillRect(x + T / 2 - 1.5, y + 7, 3, 10);
        c.fillStyle = '#a8895c'; c.fillRect(x + T / 2 - 6, y + 5, 12, 5);
        c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(x + T / 2 - 6, y + 9, 12, 1);
      } else if (ch === 'W') {
        // 記念館の外壁
        fillSmooth(c, tc, tr, x, y, function(v) {
          var wb2 = 196 + v * 18 | 0;
          return 'rgb(' + wb2 + ',' + (wb2 - 8) + ',' + (wb2 - 26) + ')';
        });
        c.fillStyle = 'rgba(90,70,40,0.14)'; c.fillRect(x, y + T - 3, T, 3);
        c.strokeStyle = 'rgba(120,100,70,0.18)'; c.lineWidth = 1;
        c.beginPath(); c.moveTo(x, y + T / 2); c.lineTo(x + T, y + T / 2); c.stroke();
        // 窓（一定間隔で）
        if ((tc + tr) % 3 === 0) {
          c.fillStyle = '#3a4a63'; c.fillRect(x + 8, y + 7, T - 16, 12);
          c.fillStyle = 'rgba(255,235,170,0.35)'; c.fillRect(x + 9, y + 8, (T - 18) / 2 - 1, 10);
          c.strokeStyle = '#26324a'; c.strokeRect(x + 8, y + 7, T - 16, 12);
        }
      } else if (ch === '^') {
        // 記念館の屋根
        fillSmooth(c, tc, tr, x, y, function(v) {
          var rb = 62 + v * 14 | 0;
          return 'rgb(' + rb + ',' + (rb + 6) + ',' + (rb + 16) + ')';
        });
        c.strokeStyle = 'rgba(20,26,40,0.4)'; c.lineWidth = 1;
        c.beginPath(); c.moveTo(x, y + 10); c.lineTo(x + T, y + 10); c.stroke();
        c.beginPath(); c.moveTo(x, y + 21); c.lineTo(x + T, y + 21); c.stroke();
        c.fillStyle = 'rgba(255,255,255,0.05)'; c.fillRect(x, y + 1, T, 2);
      } else if (ch === 'D' || ch === '1' || ch === '2' || ch === '3' || ch === '4') {
        // 施設の入口（屋外側・共通の扉）
        c.fillStyle = '#7a5a30'; c.fillRect(x, y, T, T);
        c.fillStyle = '#6a4a20'; c.fillRect(x + 3, y + 2, T - 6, T - 4);
        c.fillStyle = '#8a6a3b'; c.fillRect(x + 3, y + T / 2 - 1, T - 6, 2); c.fillRect(x + T / 2 - 1, y + 2, 2, T - 4);
        c.fillStyle = '#d4aa40'; c.beginPath(); c.arc(x + T - 8, y + T / 2, 2.5, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#f0c850'; c.beginPath(); c.arc(x + T - 8.5, y + T / 2 - 0.5, 1, 0, Math.PI * 2); c.fill();
      } else if (ch === 'r') {
        // アスファルト道路
        var rpat = hdPattern(c, 'road');
        if (rpat) { c.fillStyle = rpat; c.fillRect(x, y, T, T); return; }
        fillSmooth(c, tc, tr, x, y, function(v) {
          var ab = 88 + v * 12 | 0;
          return 'rgb(' + ab + ',' + (ab + 2) + ',' + (ab + 6) + ')';
        });
        c.fillStyle = 'rgba(0,0,0,0.08)'; c.fillRect(x, y, T, 2);
        if (h0 > 0.85) { c.fillStyle = 'rgba(255,255,255,0.06)'; c.fillRect(x + h1 * 20, y + h2 * 20, 6, 2); }
      } else if (ch === 'x') {
        // 射的の的（木枠＋同心円）
        c.fillStyle = 'rgba(0,0,0,0.18)'; c.beginPath(); c.ellipse(x + T / 2, y + T - 3, 10, 3.5, 0, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#7a5a30'; c.fillRect(x + T / 2 - 2, y + 14, 4, T - 18);
        c.fillStyle = '#f0ead8'; c.beginPath(); c.arc(x + T / 2, y + 11, 9, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#c0392b'; c.beginPath(); c.arc(x + T / 2, y + 11, 6, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#f0ead8'; c.beginPath(); c.arc(x + T / 2, y + 11, 3, 0, Math.PI * 2); c.fill();
      } else if (ch === 'a' || ch === 'o') {
        // 史跡の標柱（a=赤旗つき / o=寺標）
        c.fillStyle = 'rgba(0,0,0,0.18)'; c.beginPath(); c.ellipse(x + T / 2, y + T - 3, 9, 3.5, 0, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#8a6a40'; c.fillRect(x + T / 2 - 2, y + 6, 4, T - 10);
        c.fillStyle = '#c8b088'; c.fillRect(x + T / 2 - 5, y + 4, 10, 6);
        if (ch === 'a') { c.fillStyle = '#c0392b'; c.beginPath(); c.moveTo(x + T / 2 + 2, y + 6); c.lineTo(x + T / 2 + 13, y + 9); c.lineTo(x + T / 2 + 2, y + 13); c.closePath(); c.fill(); }
      } else if (ch === 'e') {
        // リニモ駅（ホーム・サイン）
        c.fillStyle = '#3e4a5c'; c.fillRect(x, y, T, T);
        c.fillStyle = '#556680'; c.fillRect(x + 2, y + 2, T - 4, T - 4);
        c.fillStyle = '#8fd3f4'; c.fillRect(x + 5, y + 5, T - 10, 8);
        c.fillStyle = '#ffffff'; c.font = 'bold 9px sans-serif'; c.fillText('リニモ', x + 5, y + T - 7);
      } else if (ch === 'O') {
        // 観覧車（大きな円の一部）
        fillSmooth(c, tc, tr, x, y, function(v) {
          var gb2 = 74 + v * 22 | 0, gg2 = 140 + v * 28 | 0;
          return 'rgb(' + gb2 + ',' + gg2 + ',' + (gb2 - 8) + ')';
        });
        var wcx2 = (Math.floor(tc / 4) * 4 + 2) * T, wcy2 = (Math.floor(tr / 4) * 4 + 2) * T;
        c.strokeStyle = '#d8dce4'; c.lineWidth = 3;
        c.beginPath(); c.arc(wcx2, wcy2, T * 1.7, 0, Math.PI * 2); c.stroke();
        c.lineWidth = 1.5;
        for (var sp2 = 0; sp2 < 8; sp2++) {
          var ang2 = tick * 0.004 + sp2 * Math.PI / 4;
          c.beginPath(); c.moveTo(wcx2, wcy2); c.lineTo(wcx2 + Math.cos(ang2) * T * 1.7, wcy2 + Math.sin(ang2) * T * 1.7); c.stroke();
          c.fillStyle = ['#e74c3c', '#f1c40f', '#2ecc71', '#3498db'][sp2 % 4];
          c.beginPath(); c.arc(wcx2 + Math.cos(ang2) * T * 1.7, wcy2 + Math.sin(ang2) * T * 1.7, 4, 0, Math.PI * 2); c.fill();
        }
        c.lineWidth = 1;
      } else if (ch === 'I' || ch === 'J' || ch === 'Y' || ch === 'F' || ch === 'L' || ch === 'K') {
        // 施設の外壁（色ちがい）: I=イオン J=和風 Y=一蘭 F=文化の家 L=図書館 K=丸太の家
        var wallCol = { I: ['#f2eff3', '#d9539a'], J: ['#d9cdb2', '#5a4632'], Y: ['#c0392b', '#f0ead8'], F: ['#5b7ea6', '#2e4a6b'], L: ['#9caf94', '#5c705a'], K: ['#a0703c', '#6b4620'] }[ch];
        fillSmooth(c, tc, tr, x, y, function(v) { return wallCol[0]; });
        c.fillStyle = 'rgba(0,0,0,0.08)'; c.fillRect(x, y + T - 4, T, 4);
        c.fillStyle = wallCol[1];
        if (ch === 'I') { c.fillRect(x, y + 8, T, 5); }
        else if (ch === 'Y') { if (tr % 2 === 0) c.fillRect(x, y, T, 6); }
        else if (ch === 'K') { c.fillRect(x, y + 9, T, 2); c.fillRect(x, y + 20, T, 2); }
        else { c.fillRect(x, y + T - 7, T, 3); }
        if (ch === 'J') { c.fillStyle = '#3d3225'; c.fillRect(x, y, T, 5); }
        if ((tc + tr) % 3 === 1 && ch !== 'K' && ch !== 'J') {
          c.fillStyle = 'rgba(60,80,110,0.5)'; c.fillRect(x + 9, y + 10, T - 18, 10);
          c.fillStyle = 'rgba(255,240,190,0.4)'; c.fillRect(x + 10, y + 11, (T - 20) / 2, 8);
        }
      }
    }
  }
  // ワールドパス: カメラ translate の内側で描くもの（タイル・篝火グロー・アクター）。
  // タイルは可視範囲のみループする（カメラ対応・スクロール中も tileHash 模様が安定）。
  function drawFieldWorld(c, map, player, camX, camY) {
    const r0 = Math.max(0, (camY / TILE) | 0), r1 = Math.min(map.grid.length - 1, ((camY + H) / TILE | 0) + 1);
    const c0 = Math.max(0, (camX / TILE) | 0), c1 = Math.min(map.grid[0].length - 1, ((camX + W) / TILE | 0) + 1);
    // HD建物: 読み込み済みの建物は足元タイルを草に差し替え、後段で一枚絵を重ねる
    const blds = (HD_BLD_DEF[map.key] || []).filter(function (b) { return HD_BLD[b.key]; });
    function inBld(col, row) {
      for (var i = 0; i < blds.length; i++) {
        var b = blds[i];
        if (col >= b.c0 && col < b.c0 + b.w && row >= b.r0 && row < b.r0 + b.h) return true;
      }
      return false;
    }
    const deco = []; // HD装飾スプライト（木・茂み・岩・塚）の描画予約
    for (let r = r0; r <= r1; r++) {
      for (let col = c0; col <= c1; col++) {
        var ch = map.grid[r][col];
        var dd = (map.tileset === 'outdoor') ? HD_DECO_DEF[ch] : null;
        if (dd && HD_DECO[dd.key]) {
          drawTile(c, '.', col * TILE, r * TILE, map.tileset);
          deco.push({ ch: ch, col: col, row: r, def: dd });
        } else if (blds.length && inBld(col, r)) {
          drawTile(c, '.', col * TILE, r * TILE, map.tileset);
        } else {
          drawTile(c, ch, col * TILE, r * TILE, map.tileset);
        }
      }
    }
    // Light glow pass
    c.save(); c.globalCompositeOperation = 'lighter';
    for (let r = r0; r <= r1; r++) {
      for (let col = c0; col <= c1; col++) {
        if (map.grid[r][col] === 'P') {
          var px = col * TILE + TILE / 2, py = r * TILE + 10;
          var fg = c.createRadialGradient(px, py, 0, px, py, TILE * 2.8);
          fg.addColorStop(0, 'rgba(255,150,50,0.14)'); fg.addColorStop(0.5, 'rgba(255,100,30,0.05)'); fg.addColorStop(1, 'rgba(0,0,0,0)');
          c.fillStyle = fg; c.beginPath(); c.arc(px, py, TILE * 2.8, 0, Math.PI * 2); c.fill();
        }
      }
    }
    c.restore();
    // 奥行き描画: 装飾スプライト・建物一枚絵・アクターを底辺Yでソート（HD-2Dの前後関係）
    const painter = [];
    deco.forEach(function (d) {
      var img = HD_DECO[d.def.key];
      var bw = d.def.w * TILE, bh = bw * (img.height / img.width);
      var bx = d.col * TILE + TILE / 2, by = (d.row + 1) * TILE;
      painter.push({ y: by - 2, draw: function () {
        c.fillStyle = 'rgba(0,0,0,0.22)';
        c.beginPath(); c.ellipse(bx, by - 3, bw * 0.36, bw * 0.12, 0, 0, Math.PI * 2); c.fill();
        if (d.ch === 'T' || d.ch === 'b') {
          var sw = Math.sin(tick * 0.02 + d.col * 1.1 + d.row * 0.7) * 0.012;
          c.save(); c.translate(bx, by); c.rotate(sw); c.drawImage(img, -bw / 2, -bh, bw, bh); c.restore();
        } else {
          c.drawImage(img, bx - bw / 2, by - bh, bw, bh);
        }
      } });
    });
    blds.forEach(function (b) {
      var img = HD_BLD[b.key];
      var bw = b.w * TILE, bx = b.c0 * TILE, bottom = (b.r0 + b.h) * TILE;
      var bh = bw * (img.height / img.width);
      painter.push({ y: bottom - 1, draw: function () {
        var sg = c.createLinearGradient(0, bottom - 8, 0, bottom + 8);
        sg.addColorStop(0, 'rgba(0,0,0,0)'); sg.addColorStop(0.5, 'rgba(0,0,0,0.20)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = sg; c.fillRect(bx + 4, bottom - 8, bw - 8, 16);
        c.drawImage(img, bx, bottom - bh, bw, bh);
      } });
    });
    // Actors（player=null ならプレイヤー非表示: カットシーン用）
    map.npcs.forEach(function (n) {
      var ax = n.col * TILE + TILE / 2, ay = n.row * TILE + TILE / 2;
      painter.push({ y: ay, draw: function () { drawActor(c, ax, ay, n.kind, 'down', 1); } });
    });
    if (player) painter.push({ y: player.y, draw: function () { drawActor(c, player.x, player.y, player.kind, player.facing, 1, player.moving); } });
    painter.sort(function (a, b) { return a.y - b.y; });
    painter.forEach(function (p) { p.draw(); });
  }
  // ワールドパス後半: ワールド座標の光だまり（カメラ translate の内側）
  function drawFieldAtmoWorld(c, map) {
    if (map.tileset === 'museum') {
      drawLightPool(c, 4 * TILE, 1.5 * TILE, 55, 'rgba(255,220,150,1)', 0.07);
      drawLightPool(c, 8 * TILE, 1.5 * TILE, 55, 'rgba(255,220,150,1)', 0.07);
      drawLightPool(c, 12 * TILE, 1.5 * TILE, 55, 'rgba(255,220,150,1)', 0.07);
    } else if (map.key === 'zoneA' && chapter === 'pro') {
      drawLightPool(c, 19.5 * TILE, 15 * TILE, 95, 'rgba(180,170,220,1)', 0.06);
    }
    // 雲影: 屋外をゆっくり流れる大きな影（HD-2Dの空気感）
    if (map.tileset === 'outdoor') {
      var mw = map.grid[0].length * TILE, mh = map.grid.length * TILE;
      c.save(); c.fillStyle = 'rgba(8,12,28,0.05)';
      for (var ci = 0; ci < 3; ci++) {
        var cwx = ((ci * 733 + tick * (0.25 + ci * 0.07)) % (mw + 700)) - 350;
        var cwy = ((ci * 431 + tick * 0.1) % (mh + 500)) - 250;
        c.beginPath(); c.ellipse(cwx, cwy, 190 + ci * 40, 110 + ci * 20, 0.4, 0, Math.PI * 2); c.fill();
      }
      c.restore();
    }
  }
  // スクリーンパス: 画面座標のオーバーレイ（カメラ translate の外側）
  function drawFieldAtmoScreen(c, map) {
    if (map.tileset === 'museum') {
      c.save(); c.globalAlpha = 0.04; c.fillStyle = '#ffc070'; c.fillRect(0, 0, W, H); c.restore();
    } else if (map.key === 'zoneA') {
      drawFogBand(c, H - 100, 80, 'rgba(120,130,175,0.06)');
      if (zoneAMood === 'weird') {
        // 時空切替後: 紫がかった異界の色。ゆらぎを足す
        var wpulse = 0.20 + Math.sin(tick * 0.02) * 0.03;
        c.save(); c.globalAlpha = wpulse; c.fillStyle = '#241a3f'; c.fillRect(0, 0, W, H); c.restore();
      } else {
        c.save(); c.globalAlpha = 0.18; c.fillStyle = '#1c2348'; c.fillRect(0, 0, W, H); c.restore();
      }
    } else {
      drawSunRays(c, 0.03);
      drawFogBand(c, H - 90, 70, 'rgba(170,195,160,0.04)');
      c.save(); c.globalAlpha = 0.03; c.fillStyle = '#ffd080'; c.fillRect(0, 0, W, H); c.restore();
    }
  }

  // ===================== UI: textbox / HP =====================
  let _vignette = null;
  function drawVignette(c) {
    if (!_vignette) {
      _vignette = c.createRadialGradient(W / 2, H / 2, H * 0.34, W / 2, H / 2, H * 0.72);
      _vignette.addColorStop(0, 'rgba(0,0,0,0)');
      _vignette.addColorStop(1, 'rgba(0,0,0,0.5)');
    }
    c.fillStyle = _vignette; c.fillRect(0, 0, W, H);
  }
  // 話者名 → 立ち絵の種類（後でAI/描き下ろし画像に差し替え可能）
  function speakerKind(name) {
    if (name === 'オダ') return 'oda';
    if (name === 'いけ') return 'ike';
    if (name === 'みち') return 'michi';
    if (name === '館長') return 'kancho';
    if (name === '踊り子') return 'odoriko';
    if (name === '坂元') return 'sakamoto';
    if (name === '通行人') return 'civ1';
    return null;
  }
  // 立ち絵画像の差し替え用キャッシュ（assets/face/<kind>.png があれば自動で使う）
  const FACE_IMG = {};
  function getFaceImg(kind) {
    if (FACE_IMG[kind] !== undefined) return FACE_IMG[kind];
    const img = new Image();
    img.onerror = function () { FACE_IMG[kind] = null; };
    img.src = 'assets/face/' + kind + '.png';
    FACE_IMG[kind] = img;
    return img;
  }
  var ENEMY_BATTLE_IMG = null;
  (function () {
    var img = new Image();
    img.onerror = function () { ENEMY_BATTLE_IMG = null; };
    img.onload = function () { ENEMY_BATTLE_IMG = img; };
    img.src = 'assets/enemy/ochimusha_mononoke_battle_512.png';
  })();
  var ODORIKO_BATTLE_IMG = null;
  (function () {
    var img = new Image();
    img.onerror = function () { ODORIKO_BATTLE_IMG = null; };
    img.onload = function () { ODORIKO_BATTLE_IMG = img; };
    img.src = 'assets/enemy/odoriko_battle.png';
  })();
  var LOGO_IMG = null;
  (function () {
    var img = new Image();
    img.onerror = function () { LOGO_IMG = null; };
    img.onload = function () { LOGO_IMG = img; };
    img.src = 'assets/logo/bunkalogo.png';
  })();
  var TITLE_LOGO_IMG = null;
  (function () {
    var img = new Image();
    img.onerror = function () { TITLE_LOGO_IMG = null; };
    img.onload = function () { TITLE_LOGO_IMG = img; };
    img.src = 'assets/logo/title_logo.png';
  })();
  // ===================== HD-2D フィールド画像（第1弾: 地面・装飾・建物）=====================
  // assets/tiles|deco|buildings/ に画像を置くと自動で差し替わる（無ければ従来のプロシージャル描画）。
  // 生成プロンプトは docs/asset_prompts.md を参照。
  const HD_TEX = {};   // 地面テクスチャ（シームレス）: grass / road / dirt / water
  const HD_DECO = {};  // 装飾スプライト（透過）: tree / bush / rock / mound / mound_s
  const HD_BLD = {};   // 建物一枚絵（透過・下寄せ）: museum / aeon / station / ...
  function loadHDImg(store, key, src) {
    var img = new Image();
    img.onload = function () { store[key] = img; };
    img.onerror = function () {};
    img.src = src;
  }
  ['grass', 'road', 'dirt', 'water'].forEach(function (k) { loadHDImg(HD_TEX, k, 'assets/tiles/' + k + '.png'); });
  ['tree', 'bush', 'rock', 'mound', 'mound_s'].forEach(function (k) { loadHDImg(HD_DECO, k, 'assets/deco/' + k + '.png'); });
  ['museum', 'aeon', 'station', 'ramen', 'tearoom', 'cityhall', 'kodomo', 'temple', 'bunka', 'library', 'ferris'].forEach(function (k) { loadHDImg(HD_BLD, k, 'assets/buildings/' + k + '.png'); });
  // 歩行スプライトシート（assets/sprites/<kind>_walk.png）: 3列×4行。
  // 行=正面/左/右/後ろ、列=立ち/歩き1/歩き2。あれば drawActor が自動で使う
  const HD_SPRITE = {};
  ['oda', 'ike', 'michi', 'kancho', 'odoriko', 'sakamoto', 'civ1', 'civ2'].forEach(function (k) { loadHDImg(HD_SPRITE, k, 'assets/sprites/' + k + '_walk.png'); });
  // 地面テクスチャ → 敷き詰めパターン（元画像を 8×8 タイル分に縮小してリピート。元ファイルは縮小保存しない）
  const HD_PAT = {};
  function hdPattern(c, key) {
    var img = HD_TEX[key];
    if (!img) return null;
    if (HD_PAT[key]) return HD_PAT[key];
    var off = document.createElement('canvas');
    var size = TILE * 8 * RES; // 内部解像度に合わせて高精細のまま保持
    off.width = size; off.height = size;
    off.getContext('2d').drawImage(img, 0, 0, size, size);
    var pat = c.createPattern(off, 'repeat');
    // 論理座標では 8タイル周期になるよう縮小（対応ブラウザのみ。非対応でも動作はする）
    if (pat.setTransform && typeof DOMMatrix !== 'undefined') pat.setTransform(new DOMMatrix([1 / RES, 0, 0, 1 / RES, 0, 0]));
    HD_PAT[key] = pat;
    return pat;
  }
  // 装飾スプライトの描画定義（w=タイル幅の倍率。高さは画像アスペクトから算出し底辺で接地）
  const HD_DECO_DEF = {
    T: { key: 'tree', w: 1.55 },
    b: { key: 'bush', w: 1.2 },
    R: { key: 'rock', w: 1.1 },
    M: { key: 'mound', w: 1.4 },
    N: { key: 'mound_s', w: 1.2 },
  };
  // 建物一枚絵の配置（タイル矩形）。画像は横幅にフィットし、余った高さは上（屋根方向）へはみ出す
  const HD_BLD_DEF = {
    zoneA: [
      { key: 'museum', c0: 20, r0: 2, w: 13, h: 5 },
      { key: 'aeon', c0: 1, r0: 3, w: 3, h: 3 },
      { key: 'station', c0: 35, r0: 1, w: 3, h: 2 },
    ],
    zoneB: [{ key: 'ramen', c0: 24, r0: 9, w: 5, h: 3 }],
    zoneC: [
      { key: 'temple', c0: 4, r0: 8, w: 5, h: 3 },
      { key: 'tearoom', c0: 15, r0: 10, w: 5, h: 3 },
      { key: 'cityhall', c0: 25, r0: 12, w: 6, h: 4 },
      { key: 'kodomo', c0: 32, r0: 18, w: 5, h: 3 },
    ],
    zoneD: [
      { key: 'bunka', c0: 12, r0: 6, w: 16, h: 7 },
      { key: 'library', c0: 31, r0: 17, w: 7, h: 4 },
    ],
    zoneE: [{ key: 'ferris', c0: 32, r0: 3, w: 4, h: 4 }],
  };
  // 顔ウィンドウ（仮：図形ポートレート。画像があればそれを描く）
  function drawPortrait(c, kind, x, y, s) {
    c.fillStyle = 'rgba(0,0,0,0.35)'; roundRect(c, x + 3, y + 3, s, s, 8); c.fill();
    c.fillStyle = '#0a1430'; roundRect(c, x, y, s, s, 8); c.fill();
    c.save();
    roundRect(c, x + 3, y + 3, s - 6, s - 6, 6); c.clip();
    const img = getFaceImg(kind);
    if (img && img.complete && img.naturalWidth > 0) {
      c.drawImage(img, x + 3, y + 3, s - 6, s - 6);
    } else {
      const cx = x + s / 2, cy = y + s * 0.6, pal = PAL[kind] || PAL.oda;
      c.fillStyle = '#16213f'; c.fillRect(x + 3, y + 3, s - 6, s - 6);
      if (kind === 'enemy') {
        c.fillStyle = '#3a3550'; c.beginPath(); c.arc(cx, cy, s * 0.42, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#222'; c.beginPath(); c.arc(cx, cy - s * 0.12, s * 0.42, Math.PI, 0); c.fill();
        c.fillStyle = '#ff5a5a'; c.fillRect(cx - s * 0.18, cy - s * 0.05, s * 0.12, s * 0.08); c.fillRect(cx + s * 0.06, cy - s * 0.05, s * 0.12, s * 0.08);
      } else {
        c.fillStyle = pal.body; c.beginPath(); c.arc(cx, cy + s * 0.52, s * 0.5, Math.PI, 0); c.fill();
        if (pal.short) { c.fillStyle = pal.hair; c.beginPath(); c.arc(cx, cy - s * 0.03, s * 0.37, 0, Math.PI * 2); c.fill(); }
        c.fillStyle = pal.skin; c.beginPath(); c.arc(cx, cy - s * 0.02, s * 0.3, 0, Math.PI * 2); c.fill();
        c.fillStyle = pal.hair; c.beginPath(); c.arc(cx, cy - s * 0.09, s * 0.31, Math.PI, 0); c.fill();
        if (pal.helmet) {
          c.fillStyle = pal.helmet; c.beginPath(); c.arc(cx, cy - s * 0.09, s * 0.34, Math.PI, 0); c.fill();
          c.fillStyle = pal.crest || '#ffd43b'; c.fillRect(cx - s * 0.03, cy - s * 0.46, s * 0.06, s * 0.2);
        }
        c.fillStyle = '#222';
        c.fillRect(cx - s * 0.15, cy - s * 0.04, s * 0.06, s * 0.055);
        c.fillRect(cx + s * 0.09, cy - s * 0.04, s * 0.06, s * 0.055);
      }
    }
    c.restore();
    c.strokeStyle = 'rgba(100,130,200,0.4)'; c.lineWidth = 1; roundRect(c, x + 1, y + 1, s - 2, s - 2, 7); c.stroke();
    c.strokeStyle = '#cdd9ff'; c.lineWidth = 1.5; roundRect(c, x + 3, y + 3, s - 6, s - 6, 6); c.stroke(); c.lineWidth = 1;
  }
  function drawTextbox(c, name, text, arrow, compact) {
    const h = compact ? 111 : 138;
    const x = 12, y = H - h - 12, w = W - 24;
    const kind = speakerKind(name);
    if (kind) drawPortrait(c, kind, x + 8, y - 86, 90);
    // Outer shadow
    c.fillStyle = 'rgba(0,0,0,0.3)'; roundRect(c, x + 3, y + 3, w, h, 10); c.fill();
    // Main background
    var tbg = c.createLinearGradient(x, y, x, y + h);
    tbg.addColorStop(0, 'rgba(16,24,55,0.95)'); tbg.addColorStop(0.5, 'rgba(10,16,40,0.96)'); tbg.addColorStop(1, 'rgba(6,10,28,0.97)');
    c.fillStyle = tbg; roundRect(c, x, y, w, h, 10); c.fill();
    // Inner top highlight
    c.fillStyle = 'rgba(100,130,200,0.06)'; roundRect(c, x + 4, y + 4, w - 8, h / 3, 6); c.fill();
    // Outer border
    c.strokeStyle = 'rgba(100,130,200,0.5)'; c.lineWidth = 1.5; roundRect(c, x + 1, y + 1, w - 2, h - 2, 9); c.stroke();
    // Inner border
    c.strokeStyle = '#cdd9ff'; c.lineWidth = 1.5; roundRect(c, x + 4, y + 4, w - 8, h - 8, 7); c.stroke();
    // Corner ornaments
    c.strokeStyle = 'rgba(200,220,255,0.3)'; c.lineWidth = 1;
    var co = 8;
    c.beginPath(); c.moveTo(x + co, y + 4); c.lineTo(x + 4, y + 4); c.lineTo(x + 4, y + co); c.stroke();
    c.beginPath(); c.moveTo(x + w - co, y + 4); c.lineTo(x + w - 4, y + 4); c.lineTo(x + w - 4, y + co); c.stroke();
    c.beginPath(); c.moveTo(x + co, y + h - 4); c.lineTo(x + 4, y + h - 4); c.lineTo(x + 4, y + h - co); c.stroke();
    c.beginPath(); c.moveTo(x + w - co, y + h - 4); c.lineTo(x + w - 4, y + h - 4); c.lineTo(x + w - 4, y + h - co); c.stroke();
    c.lineWidth = 1;
    let ty = y + 30;
    const tx = x + 18;
    if (name) {
      c.fillStyle = '#ffd43b'; c.font = 'bold 19px "Hiragino Sans","Yu Gothic UI",sans-serif';
      c.fillText(name, tx, ty); ty += 30;
    }
    c.fillStyle = '#e8ecf2'; c.font = '20px "Hiragino Sans","Yu Gothic UI",sans-serif';
    const lines = wrapText(c, text, w - 56);
    for (let i = 0; i < lines.length; i++) { c.fillText(lines[i], tx, ty); ty += 27; }
    if (arrow) {
      var aa = Math.sin(tick * 0.08) * 0.3 + 0.7;
      c.fillStyle = 'rgba(200,220,255,' + aa + ')'; c.fillText('▼', x + w - 30, y + h - 16);
    }
  }
  function drawHPBar(c, x, y, w, cur, max, color) {
    // Track shadow
    c.fillStyle = 'rgba(0,0,0,0.4)'; roundRect(c, x + 1, y + 1, w, 11, 5); c.fill();
    // Track background
    var trk = c.createLinearGradient(x, y, x, y + 11);
    trk.addColorStop(0, '#1a1e25'); trk.addColorStop(1, '#282d35');
    c.fillStyle = trk; roundRect(c, x, y, w, 11, 5); c.fill();
    const r = Math.max(0, Math.min(1, cur / max));
    var bw = Math.max(2, w * r);
    // Fill gradient
    var fg = c.createLinearGradient(x, y, x, y + 11);
    fg.addColorStop(0, color); fg.addColorStop(0.4, color); fg.addColorStop(1, '#1a3a10');
    c.fillStyle = fg; roundRect(c, x, y, bw, 11, 5); c.fill();
    // Glossy highlight
    c.fillStyle = 'rgba(255,255,255,0.22)'; roundRect(c, x, y, bw, 5, 3); c.fill();
    // Bright edge
    c.fillStyle = 'rgba(255,255,255,0.08)'; c.fillRect(x + 3, y + 9, bw - 6, 1);
    // Border
    c.strokeStyle = 'rgba(200,220,255,0.35)'; c.lineWidth = 1; roundRect(c, x, y, w, 11, 5); c.stroke();
  }

  // ===================== Dialogue =====================
  var DIALOG_MAX_LINES = 3;
  const Dialog = {
    active: false, lines: [], i: 0, t: 0, onDone: null, speed: 46, holdTimer: 0,
    start: function (lines, onDone) {
      ctx.font = '20px "Hiragino Sans","Yu Gothic UI",sans-serif';
      var maxw = W - 24 - 56, processed = [];
      for (var j = 0; j < lines.length; j++) {
        var line = lines[j], wrapped = wrapText(ctx, line.text, maxw);
        if (wrapped.length <= DIALOG_MAX_LINES) { processed.push(line); }
        else { for (var k = 0; k < wrapped.length; k += DIALOG_MAX_LINES) { processed.push({ name: line.name, text: wrapped.slice(k, k + DIALOG_MAX_LINES).join('\n') }); } }
      }
      this.active = true; this.lines = processed; this.i = 0; this.t = 0; this.holdTimer = 0; this.onDone = onDone || null;
    },
    _advance: function () {
      this.i++; this.t = 0; this.holdTimer = 0;
      if (this.i >= this.lines.length) {
        this.active = false;
        var cb = this.onDone; this.onDone = null;
        if (cb) cb();
      }
    },
    update: function (dt) {
      if (!this.active) return;
      var line = this.lines[this.i], full = line.text, shown = Math.floor(this.t);
      if (Input.pressed('confirm') || Input.pressed('cancel')) {
        if (shown < full.length) { this.t = full.length; }
        else { this._advance(); }
      } else if (shown < full.length) {
        this.holdTimer = 0;
        this.t += dt * this.speed * (Input.down('confirm') ? 3 : 1);
      } else if (Input.down('confirm')) {
        this.holdTimer += dt;
        if (this.holdTimer > 0.22) { this.holdTimer = 0; this._advance(); }
      } else { this.holdTimer = 0; }
    },
    render: function (c) {
      if (!this.active) return;
      var line = this.lines[this.i], full = line.text;
      var shown = Math.min(Math.floor(this.t), full.length);
      drawTextbox(c, line.name || '', full.slice(0, shown), shown >= full.length);
    },
  };

  // ===================== Choice（選択肢） =====================
  // Dialog と同様のシングルトン。フィールド系シーンの update/render から呼ばれる。
  const Choice = {
    active: false, options: [], cur: 0, onPick: null, prompt: '',
    start: function (prompt, options, onPick) {
      this.active = true; this.prompt = prompt; this.options = options; this.cur = 0; this.onPick = onPick || null;
    },
    update: function (dt) {
      if (!this.active) return;
      if (Input.pressed('up')) this.cur = (this.cur + this.options.length - 1) % this.options.length;
      if (Input.pressed('down')) this.cur = (this.cur + 1) % this.options.length;
      if (Input.pressed('confirm')) {
        this.active = false;
        var cb = this.onPick, pick = this.cur; this.onPick = null;
        if (cb) cb(pick);
      }
    },
    render: function (c) {
      if (!this.active) return;
      var n = this.options.length;
      var bh = 50 + n * 34;
      var x = 56, y = H - bh - 18, w = W - 112;
      c.fillStyle = 'rgba(0,0,0,0.3)'; roundRect(c, x + 3, y + 3, w, bh, 10); c.fill();
      c.fillStyle = 'rgba(10,16,40,0.97)'; roundRect(c, x, y, w, bh, 10); c.fill();
      c.strokeStyle = '#cdd9ff'; c.lineWidth = 1.5; roundRect(c, x + 3, y + 3, w - 6, bh - 6, 8); c.stroke(); c.lineWidth = 1;
      c.textAlign = 'left';
      c.fillStyle = '#ffd43b'; c.font = 'bold 15px "Hiragino Sans",sans-serif';
      c.fillText(this.prompt, x + 16, y + 26);
      c.font = '16px "Hiragino Sans",sans-serif';
      for (var i = 0; i < n; i++) {
        c.fillStyle = i === this.cur ? '#ffd43b' : '#e8ecf2';
        c.fillText((i === this.cur ? '▶ ' : '　 ') + this.options[i], x + 22, y + 50 + i * 34);
      }
    },
  };

  // ===================== Transition (flash) =====================
  const trans = { active: false, t: 0, dur: 0.8, mid: null, fired: false };
  function startTransition(mid) { trans.active = true; trans.t = 0; trans.mid = mid; trans.fired = false; }
  function updateTransition(dt) {
    if (!trans.active) return;
    trans.t += dt;
    if (trans.t >= trans.dur / 2 && !trans.fired) { trans.fired = true; if (trans.mid) trans.mid(); }
    if (trans.t >= trans.dur) trans.active = false;
  }
  function renderTransition(c) {
    if (!trans.active) return;
    const half = trans.dur / 2;
    const a = trans.t < half ? (trans.t / half) : (1 - (trans.t - half) / half);
    c.fillStyle = 'rgba(255,255,255,' + Math.min(1, Math.max(0, a)) + ')';
    c.fillRect(0, 0, W, H);
  }

  // ===================== Scene manager =====================
  let scene = null;
  function setScene(s) { clearParts(); scene = s; if (s && s.enter) s.enter(); }

  // ===================== Hero progression (persistent) =====================
  const ITEMS = {
    bokuto:   { name: '木刀',           type: 'weapon', atk: 0, desc: '修行用の木刀。なんとなく 落ち着く。' },
    replica:  { name: '刀（レプリカ）', type: 'weapon', atk: 3, desc: '記念館の 展示刀の 複製。よく斬れる…気がする。' },
    kanehira: { name: '大包平',         type: 'weapon', atk: 7, desc: '一国に 替え難い 名刀。いつか、輝政の 手に。' },
    nuno:     { name: '記念館の制服',   type: 'armor',  def: 0, desc: '長久手古戦場記念館の 制服。動きやすい。' },
    do:       { name: '胴丸',           type: 'armor',  def: 2, desc: '軽くて 丈夫な 胴の鎧。' },
    akazonae: { name: '赤備えの具足',   type: 'armor',  def: 5, desc: '真っ赤に 統一された 井伊の具足…の、写し。' },
  };
  const Hero = { lv: 1, exp: 0, maxhp: 30, atkBonus: 0, weapon: 'bokuto', armor: 'nuno', items: ['replica', 'do'] };
  function weaponAtk() { return (ITEMS[Hero.weapon] && ITEMS[Hero.weapon].atk) || 0; }
  function armorDef() { return (ITEMS[Hero.armor] && ITEMS[Hero.armor].def) || 0; }

  // ===================== 通貨・消耗品（イオンで購入・戦闘中に使用） =====================
  const GOODS = {
    onigiri: { name: 'おにぎり', heal: 15, price: 150, desc: '戦闘中に HPを 15 回復する。' },
    cha:     { name: '長久手茶', heal: 40, price: 300, desc: '戦闘中に HPを 40 回復する。香りがいい。' },
    hyorogan: { name: '兵糧丸', heal: 25, price: 0, desc: '戦国の 携帯食。戦闘中に HPを 25 回復する。（こども塾で 作れる）' },
  };
  let gold = 1000; // 所持金（円）
  const bag = { onigiri: 0, cha: 0, hyorogan: 0 };
  function bagCount() { return (bag.onigiri || 0) + (bag.cha || 0) + (bag.hyorogan || 0); }

  // 史跡図鑑・武将名鑑
  const ZUKAN = [
    { id: 'kinenkan', name: '長久手古戦場記念館', desc: '国指定史跡・長久手古戦場公園に建つ記念館。小牧・長久手の戦いを語り継ぐ。' },
    { id: 'kosenjo', name: '長久手古戦場（公園）', desc: '1584年、小牧・長久手の戦いの激戦地。今は穏やかな公園になっている。' },
    { id: 'shonyu', name: '勝入塚', desc: '池田恒興（勝入斎）の墓と伝わる塚。今も人々が花を手向ける。' },
    { id: 'shokuro', name: '庄九郎塚', desc: '池田元助（庄九郎）——恒興の長男の墓と伝わる塚。親子でこの地に眠る。' },
    { id: 'irogane', name: '色金山', desc: '徳川家康が軍議を開いたと伝わる標高約198mの山。腰かけたという「床机石」が残る。' },
    { id: 'chashitsu', name: '色金山の茶室', desc: '色金山歴史公園のふもとに建つ茶室。日本庭園を眺めながら、自分で抹茶を点てる体験ができる（500円・季節の和菓子付き）。' },
    { id: 'mihata', name: '御旗山', desc: '家康が金扇の馬印（大将の目印）を立て、全軍を鼓舞したと伝わる山。' },
    { id: 'chinoike', name: '血の池公園', desc: '戦の後、武士が槍や刀の血を洗い、水が赤く染まったと伝わる池の跡。' },
    { id: 'musashi', name: '武蔵塚', desc: '「鬼武蔵」と恐れられた猛将・森長可が討死した地に建つ塚。剣豪の宮本武蔵とは別人。' },
    { id: 'ansho', name: '安昌寺（首塚）', desc: '戦の後、雲山和尚が敵味方の区別なく討死した武士を葬ったと伝わる寺。首塚がある。' },
    { id: 'higane', name: '桧ヶ根公園（井伊直政陣地跡）', desc: '「赤備え」の井伊直政が陣を構えたと伝わる地。長久手の戦いの布陣が街に残る。' },
    { id: 'bunka', name: '文化の家', desc: '長久手市の文化芸術の拠点。森のホールで『合戦ズ』が上演された。ガレリアには公演ポスターが並ぶ。' },
    { id: 'moricoro', name: 'モリコロパーク', desc: '2005年の愛知万博「愛・地球博」の会場跡地に整備された記念公園。リニモで行ける。' },
  ];
  const MEIKAN = [
    { id: 'oda', name: 'オダ', desc: '記念館の職員。歴史は ちょっと苦手。実は織田信長の末裔…？' },
    { id: 'ike', name: '池田輝政（いけ）', desc: '池田恒興の次男。生き延びて池田家を継ぎ、のちに大大名へ。名刀「大包平」の所有者。' },
    { id: 'michi', name: '林通具（みち）', desc: '森長可の家臣。よく喋る。小牧・長久手の戦いで討死する運命。' },
    { id: 'tsuneoki', name: '池田恒興', desc: '信長の乳兄弟で冒険好き。中入り作戦を献策し、長久手で討死。勝入塚に眠る。' },
    { id: 'nagayoshi', name: '森長可', desc: '恒興の婿。猛将で美男子。井伊直政隊の鉄砲に眉間を撃たれ討死。' },
    { id: 'naomasa', name: '井伊直政', desc: '徳川家康の家臣。武田旧臣の「赤備え」を率い、この戦が初陣。' },
    { id: 'hideyoshi', name: '羽柴秀吉', desc: 'のちの豊臣秀吉。この時はまだ「羽柴」。天下統一へ向かう。' },
    { id: 'ieyasu', name: '徳川家康', desc: 'この戦では戦術的に勝利。のちに天下を取る。' },
    { id: 'nobunaga', name: '織田信長', desc: '天下布武を掲げた武将。1582年、本能寺で明智光秀に討たれた。' },
  ];
  const zukanSet = new Set(['kinenkan']);
  const meikanSet = new Set(['oda']);
  const tourCleared = new Set(); // 史跡めぐりでクリア済みの史跡id
  let tourReward = false;        // 全踏破ボーナス受領済みか
  function unlockZukan(id) { zukanSet.add(id); }
  function unlockMeikan(id) { meikanSet.add(id); }

  let tutorialDone = false;
  let storyStage = 0;
  let activeField = null;
  function expToNext(lv) { return 8 + (lv - 1) * 6; }
  function miyaLvFromLv(lv) { return Math.min(3, Math.ceil(lv / 2)); }

  // ===================== 難易度（イージー / ハード） =====================
  // enemyHp/enemyAtk: 敵のHP・攻撃倍率、encRate: エンカウント率倍率（バランスは P6 で調整）
  let difficulty = 'easy';
  const DIFF = {
    easy: { label: 'イージー', enemyHp: 1.0, enemyAtk: 1.0, encRate: 1.0 },
    hard: { label: 'ハード',   enemyHp: 1.5, enemyAtk: 1.35, encRate: 1.3 },
  };

  // ===================== パーティ（仲間） =====================
  // オダ以外の同行メンバー。加入時に push、離脱時に除去する（P2/P3 で使用）。
  // 形式: { id, name, kind, hp, maxhp, atkLo, atkHi, aDef }
  const partyMembers = [];

  // ===================== 章進行（原作準拠フロー） =====================
  // pro → ch1（見回り）→ ch2（いけ出会い）→ ch3（みち再会）→ legacy（旧フロー: 戦トーク以降。P3で置換予定）
  let chapter = 'pro';
  let ch1Seen = { mound: false, shokuro: false, museum: false };
  let ch2step = 0;
  let ch3rusu = false;         // 館長不在を確認したか
  let zoneAMood = 'dusk';      // dusk → weird（踊り子の舞で世界が変わった後）
  let teaBest = '';            // 抹茶体験のベストランク（'' / 'C' / 'B' / 'A'）
  let mgDone = {};                    // ミニゲーム初回クリア記録（報酬の重複防止）
  let kanchoLove = 0;                 // 館長の好感度（選択肢で上下）
  let kanchoBond = false;             // エピローグで絆が結ばれたか（ハードの仲間加入条件）
  let kanchoEv = {};                  // 好感度イベントの発火記録
  const visitedSites = new Set();     // 本編で現地を訪れた史跡（史跡めぐりの解放条件）
  let stationUsed = false;            // リニモ初回ネタ用（セッション内）
  const enteredFlavor = new Set();    // 施設の入場ナレーションを一度だけ出す用
  // main2（四章〜エピローグ）の直列進行。各値は「これから行うこと」:
  // 0=四章導入＋現地取材の決意 1=現地取材クエスト（5史跡を踏破・街解放） 2=戦トーク
  // 3=もののけ共闘戦 4=告白〜みち対峙戦 5=天下問答〜みち別れ
  // 6=落武者ステルス 7=大包平の伏線〜いけ退場 8=館長エピローグ 9=見回り〜ラストバトル
  let stageP3 = 0;

  // ===================== Save / Load (localStorage) =====================
  // v2: difficulty を追加。v1 セーブは初回読み込み時に v2 へ変換する（difficulty='easy'）。
  // storyStage は現状数値のまま。章ID化する際（P2/P3）はここに変換表を足す。
  const SAVE_KEY = 'kassenzu_save_v2';
  const SAVE_KEY_V1 = 'kassenzu_save_v1';
  function saveGame() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        v: 2, hero: Hero, difficulty: difficulty,
        tutorialDone: tutorialDone, storyStage: storyStage,
        chapter: chapter, ch1Seen: ch1Seen, ch2step: ch2step, ch3rusu: ch3rusu, zoneAMood: zoneAMood, teaBest: teaBest, stageP3: stageP3, p3v: 2,
        gold: gold, bag: bag, mgDone: mgDone, yen: 1,
        kanchoLove: kanchoLove, kanchoBond: kanchoBond, kanchoEv: kanchoEv, visited: Array.from(visitedSites),
        zukan: Array.from(zukanSet), meikan: Array.from(meikanSet),
        tour: Array.from(tourCleared), tourReward: tourReward,
      }));
      return true;
    } catch (e) { return false; }
  }
  function hasSave() {
    try { return !!(localStorage.getItem(SAVE_KEY) || localStorage.getItem(SAVE_KEY_V1)); }
    catch (e) { return false; }
  }
  function loadGame() {
    try {
      let d = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
      if (!d) {
        const d1 = JSON.parse(localStorage.getItem(SAVE_KEY_V1) || 'null');
        if (!d1) return false;
        d = d1; d.v = 2; d.difficulty = 'easy'; // v1 → v2 変換
      }
      if (d.hero) { Hero.lv = d.hero.lv; Hero.exp = d.hero.exp; Hero.maxhp = d.hero.maxhp; Hero.atkBonus = d.hero.atkBonus; Hero.weapon = d.hero.weapon; Hero.armor = d.hero.armor; Hero.items = d.hero.items || []; }
      difficulty = (d.difficulty === 'hard') ? 'hard' : 'easy';
      tutorialDone = !!d.tutorialDone; storyStage = d.storyStage || 0;
      // 章進行。旧セーブ（chapter無し）は進行度から復元
      chapter = d.chapter || ((tutorialDone || storyStage > 0) ? 'legacy' : 'pro');
      ch1Seen = d.ch1Seen || { mound: false, shokuro: false, museum: false };
      ch2step = d.ch2step || 0;
      ch3rusu = !!d.ch3rusu;
      zoneAMood = d.zoneAMood || (chapter === 'pro' ? 'dusk' : 'weird');
      teaBest = d.teaBest || '';
      stageP3 = d.stageP3 || 0;
      // 旧ステージ番号（現地取材クエスト導入前）からの移行: 1以降を+1ずらす
      if (!d.p3v && chapter === 'main2' && stageP3 >= 1) stageP3 += 1;
      gold = (typeof d.gold === 'number') ? d.gold : 1000;
      if (!d.yen) gold = Math.max(1000, gold * 7); // 旧「りょう」セーブを円に換算
      bag.onigiri = (d.bag && d.bag.onigiri) || 0;
      bag.cha = (d.bag && d.bag.cha) || 0;
      bag.hyorogan = (d.bag && d.bag.hyorogan) || 0;
      mgDone = d.mgDone || {};
      kanchoLove = d.kanchoLove || 0;
      kanchoBond = !!d.kanchoBond;
      kanchoEv = d.kanchoEv || {};
      visitedSites.clear();
      (d.visited || []).forEach(function (x) { visitedSites.add(x); });
      // 旧ダイジェスト版セーブ（legacy）は原作フル収録の四章から再開
      if (chapter === 'legacy') { chapter = 'main2'; stageP3 = 0; }
      zukanSet.clear(); (d.zukan || []).forEach(function (x) { zukanSet.add(x); });
      meikanSet.clear(); (d.meikan || []).forEach(function (x) { meikanSet.add(x); });
      tourCleared.clear(); (d.tour || []).forEach(function (x) { tourCleared.add(x); });
      // 旧セーブ互換: 既に踏破済みの史跡は訪問済み扱い
      tourCleared.forEach(function (x) { visitedSites.add(x); });
      tourReward = !!d.tourReward;
      return true;
    } catch (e) { return false; }
  }

  // ===================== Story text (→ dialogue.js) =====================
  const PROLOGUE_OPEN = DIALOGUE.prologue_open;
  const PROLOGUE_MEET = DIALOGUE.prologue_meet;

  // ===================== Field scene =====================
  function makeField(mapKey, spawnOverride, introLines) {
    const map = parseMap(mapKey);
    let proTriggered = false;
    // spawnOverride はタイル {col,row} と ピクセル {x,y} の両対応（ゾーン間シームレス切替用）
    const sp = spawnOverride || map.spawn;
    const px = (sp.x != null) ? sp.x : sp.col * TILE + TILE / 2;
    const py = (sp.y != null) ? sp.y : sp.row * TILE + TILE / 2;
    const player = { x: px, y: py, facing: 'down', kind: 'oda' };
    // カメラ: プレイヤー中心・マップ端でクランプ。画面より小さいマップでは常に0（固定画面）
    // camFocus 設定時はそちらを中心にする（カットシーン用）
    function camPos() {
      var fx2 = camFocus ? camFocus.x : player.x;
      var fy2 = camFocus ? camFocus.y : player.y;
      var cx = 0, cy = 0;
      if (map.pxW > W) cx = Math.max(0, Math.min(map.pxW - W, fx2 - W / 2));
      if (map.pxH > H) cy = Math.max(0, Math.min(map.pxH - H, fy2 - H / 2));
      return { x: Math.round(cx), y: Math.round(cy) };
    }
    let intro = introLines;
    const SPEED = 132, HALF = 11;
    let sceneActors = [], anim = null;
    let hidePlayer = false, camFocus = null, darkFx = false;
    // 任意の点へ歩かせる汎用アニメ（カットシーン用）
    function walkTo(actor, tx, ty, speed, onDone) {
      actor.moving = true;
      anim = function (dt) {
        var dx = tx - actor.x, dy = ty - actor.y;
        var dist = Math.sqrt(dx * dx + dy * dy);
        if (Math.abs(dx) > Math.abs(dy)) actor.facing = dx < 0 ? 'left' : 'right';
        else actor.facing = dy < 0 ? 'up' : 'down';
        if (dist <= speed * dt) {
          actor.x = tx; actor.y = ty; actor.moving = false; anim = null;
          if (onDone) onDone();
        } else {
          actor.x += (dx / dist) * speed * dt;
          actor.y += (dy / dist) * speed * dt;
        }
      };
    }
    function findActor(id) {
      for (var i = 0; i < sceneActors.length; i++) if (sceneActors[i].id === id) return sceneActors[i];
      return null;
    }

    function canWalk(cx, cy) {
      const pts = [
        [cx - HALF, cy - HALF], [cx + HALF, cy - HALF], [cx - HALF, cy + HALF], [cx + HALF, cy + HALF],
        [cx - HALF, cy], [cx + HALF, cy], [cx, cy - HALF], [cx, cy + HALF],
      ];
      for (let k = 0; k < pts.length; k++) {
        const col = Math.floor(pts[k][0] / TILE), row = Math.floor(pts[k][1] / TILE);
        if (row < 0 || col < 0 || row >= map.grid.length || col >= map.grid[0].length) return false;
        if (map.solid.has(map.grid[row][col])) return false;
      }
      const pcol = Math.floor(cx / TILE), prow = Math.floor(cy / TILE);
      for (let n = 0; n < map.npcs.length; n++) { if (map.npcs[n].col === pcol && map.npcs[n].row === prow) return false; }
      return true;
    }
    function frontTile() {
      const col = Math.floor(player.x / TILE), row = Math.floor(player.y / TILE);
      var f = player.facing;
      return {
        col: col + (f.indexOf('left') >= 0 ? -1 : f.indexOf('right') >= 0 ? 1 : 0),
        row: row + (f.indexOf('up') >= 0 ? -1 : f.indexOf('down') >= 0 ? 1 : 0),
      };
    }
    function interact() {
      const f = frontTile();
      let id = null;
      for (let n = 0; n < map.npcs.length; n++) { if (map.npcs[n].col === f.col && map.npcs[n].row === f.row) { id = map.npcs[n].id; break; } }
      if (!id) id = map.acts[f.col + ',' + f.row] || null;
      if (id) runAction(id);
    }
    function runAction(id) {
      if (id === 'byobu') Dialog.start(DIALOGUE.byobu);
      else if (id === 'katchu') Dialog.start(DIALOGUE.katchu);
      else if (id === 'katana') Dialog.start(DIALOGUE.katana);
      else if (id === 'save') { const ok = saveGame(); Dialog.start(ok ? DIALOGUE.save_ok : DIALOGUE.save_fail); }
      else if (id === 'shokuro') { unlockZukan('shokuro'); Dialog.start(DIALOGUE.ch1_shokuro, function () { ch1Seen.shokuro = true; checkCh1Done(); }); }
      else if (id === 'rock') Dialog.start(DIALOGUE.ch1_rock);
      else if (id === 'museum_enter') {
        ch1Seen.museum = true;
        startTransition(function () { setScene(makeField('museum', { col: 7, row: 12 }, null)); });
      }
      else if (id === 'museum_exit') {
        startTransition(function () { setScene(makeField('zoneA', { col: 25, row: 7 }, null)); });
      }
      else if (id === 'aeon') {
        // いけと出会う前（プロローグ・一章）は、いけに言及しないセリフにする
        var aeonLines = (chapter === 'pro' || chapter === 'ch1') ? DIALOGUE.aeon_first : DIALOGUE.aeon_welcome;
        Dialog.start(aeonLines, function () {
          setScene(makeShop(function () { startTransition(function () { setScene(makeField(mapKey, { x: player.x, y: player.y }, null)); }); }));
        });
      }
      else if (id === 'station') {
        var stLines = stationUsed ? DIALOGUE.station_ride : DIALOGUE.station_first;
        stationUsed = true;
        Dialog.start(stLines, function () {
          startTransition(function () {
            if (mapKey === 'zoneE') setScene(makeField('zoneA', { col: 34, row: 2 }, null));
            else setScene(makeField('zoneE', { col: 6, row: 20 }, null));
          });
        });
      }
      else if (id === 'ramen') {
        if (gold >= 950) {
          gold -= 950;
          Dialog.start(DIALOGUE.ramen_event, function () {
            if (chapter === 'main2' && stageP3 === 1 && !kanchoEv.ramen && gold >= 950) {
              Choice.start('（……館長の 分も、買っておく？）', ['お土産に もう一杯 買う（950円）', '自分の 分だけに する'], function (pick) {
                kanchoEv.ramen = true;
                if (pick === 0) {
                  gold -= 950; kanchoLove++;
                  Dialog.start([{ name: 'オダ', text: '（お土産ラーメン、確保。のびない うちに 渡せると いいけど）' }], function () { saveGame(); });
                } else saveGame();
              });
            } else saveGame();
          });
        }
        else Dialog.start([{ name: 'オダ', text: '（一杯 950円…。いまは 持ち合わせが 足りない。もののけ退治で 稼いでこよう）' }]);
      }
      else if (id === 'cityhall') {
        var chBack = (function () { var hx = player.x, hy = player.y; return function () { startTransition(function () { setScene(makeField(mapKey, { x: hx, y: hy }, null)); }); }; })();
        Dialog.start(DIALOGUE.cityhall_talk, function () {
          Dialog.start(DIALOGUE.kentei_intro, function () { setScene(makeKentei(chBack)); });
        });
      }
      else if (id === 'kodomo') {
        var kdBack = (function () { var hx = player.x, hy = player.y; return function () { startTransition(function () { setScene(makeField(mapKey, { x: hx, y: hy }, null)); }); }; })();
        Dialog.start(DIALOGUE.kodomo_talk, function () {
          Dialog.start(DIALOGUE.hyorogan_intro, function () { setScene(makeHyorogan(kdBack)); });
        });
      }
      else if (id === 'library') {
        var lbBack = (function () { var hx = player.x, hy = player.y; return function () { startTransition(function () { setScene(makeField(mapKey, { x: hx, y: hy }, null)); }); }; })();
        Dialog.start(DIALOGUE.library_talk, function () {
          Dialog.start(DIALOGUE.lib_intro, function () { setScene(makeLibPuzzle(lbBack)); });
        });
      }
      else if (id === 'shateki') {
        var stBack = (function () { var hx = player.x, hy = player.y; return function () { startTransition(function () { setScene(makeField(mapKey, { x: hx, y: hy }, null)); }); }; })();
        setScene(makeShateki(stBack));
      }
      else if (id === 'drumcircle') {
        var dcBack = (function () { var hx = player.x, hy = player.y; return function () { startTransition(function () { setScene(makeField(mapKey, { x: hx, y: hy }, null)); }); }; })();
        Dialog.start(DIALOGUE.drum_intro, function () { setScene(makeDrumCircle(dcBack)); });
      }
      else if (id === 'wheel') Dialog.start(DIALOGUE.wheel_talk);
      else if (id === 'higane') {
        if (!zukanSet.has('higane')) {
          unlockZukan('higane'); unlockMeikan('naomasa');
          if (Hero.items.indexOf('akazonae') < 0 && Hero.armor !== 'akazonae') Hero.items.push('akazonae');
          Dialog.start(DIALOGUE.higane_event, function () { saveGame(); });
        } else Dialog.start(DIALOGUE.higane_done);
      }
      else if (id === 'tearoom') {
        if (gold >= 500) {
          // 500円はここでは保存しない（ハードで失敗＝ゲームオーバー時に、他ミニゲーム同様セーブ地点まで巻き戻すため。成功時は結果画面の saveGame で確定する）
          gold -= 500;
          setScene(makeTeaRoom(function () { startTransition(function () { setScene(makeField('zoneC', { col: 17, row: 13 }, null)); }); }));
        } else Dialog.start([{ name: 'オダ', text: '（抹茶体験は 500円。……いまは 持ち合わせが 足りない）' }]);
      }
      else if (id && id.indexOf('site_') === 0) {
        var site = siteById(id.slice(5));
        if (site) {
          visitedSites.add(site.id); saveGame();
          var backX = player.x, backY = player.y;
          setScene(makeSiteVisit(site, function () { startTransition(function () { setScene(makeField(mapKey, { x: backX, y: backY }, null)); }); }));
        }
      }
      else if (id === 'bunka_in') { unlockZukan('bunka'); startTransition(function () { setScene(makeField('bunka1', null, null)); }); }
      else if (id === 'bunka_exit') startTransition(function () { setScene(makeField('zoneD', { col: 19, row: 13 }, null)); });
      else if (id === 'bunka_up') startTransition(function () { setScene(makeField('bunka2', { col: 2, row: 2 }, null)); });
      else if (id === 'bunka_down') startTransition(function () { setScene(makeField('bunka1', { col: 2, row: 2 }, null)); });
      else if (id === 'mori_in') startTransition(function () { setScene(makeField('mori', null, null)); });
      else if (id === 'mori_exit') startTransition(function () { setScene(makeField('bunka1', { col: 13, row: 2 }, null)); });
      else if (id === 'sakamoto') Dialog.start(DIALOGUE.sakamoto_talk);
      else if (id === 'expo1') Dialog.start(DIALOGUE.expo1_talk);
      else if (id === 'expo2') Dialog.start(DIALOGUE.expo2_talk);
      else if (id === 'expo3') { unlockZukan('moricoro'); Dialog.start(DIALOGUE.expo3_talk); }
      else if (id === 'ike') Dialog.start(DIALOGUE.ike_idle);
      else if (id === 'mound') {
        unlockZukan('shonyu'); unlockMeikan('tsuneoki');
        if (chapter === 'post' && mapKey === 'zoneA') {
          // ポストゲーム: 勝入塚に祈ると仲間が再集結し、大ボスに挑める
          Choice.start('勝入塚に 祈りを 捧げますか？', ['祈る', 'やめておく'], function (pick) {
            if (pick !== 0) return;
            Dialog.start(DIALOGUE.post_pray, function () {
              var withKancho = (difficulty === 'hard' && kanchoBond);
              partyMembers.length = 0;
              partyMembers.push({ id: 'ike', name: 'いけ', kind: 'ike', maxhp: 34, atkLo: 9, atkHi: 14, aDef: 2 });
              partyMembers.push({ id: 'michi', name: 'みち', kind: 'michi', maxhp: 36, atkLo: 8, atkHi: 12, aDef: 2 });
              function proceedBoss() {
                Dialog.start(DIALOGUE.post_boss_intro, function () {
                  startBattle({
                    gated: false,
                    enemy: {
                      name: difficulty === 'hard' ? '真・はぐれ大もののけ' : 'はぐれ大もののけ',
                      hp: difficulty === 'hard' ? 110 : 80, kind: 'enemy',
                      atkLo: difficulty === 'hard' ? 9 : 6, atkHi: difficulty === 'hard' ? 15 : 11,
                      atkLabel: '大もののけの 一撃',
                      appearMsg: '無念の 群れが、ひとつに 束なった！',
                      winMsg: '大もののけは、光の 粒に なって ほどけていった。',
                    },
                    onWin: function () {
                      partyMembers.length = 0;
                      gold += 5000; saveGame();
                      Dialog.start(DIALOGUE.post_win);
                      startTransition(function () { setScene(makeField('zoneA', { col: 33, row: 12 }, null)); });
                    },
                    onLose: function () { partyMembers.length = 0; startTransition(function () { setScene(makeField('zoneA', { col: 33, row: 12 }, null)); }); },
                  });
                });
              }
              function maybeKancho() {
                if (withKancho) {
                  partyMembers.push({ id: 'kancho', name: '館長', kind: 'kancho', maxhp: 30, atkLo: 6, atkHi: 10, aDef: 1 });
                  Dialog.start(DIALOGUE.post_kancho_join, function () { proceedBoss(); });
                } else proceedBoss();
              }
              if (Hero.items.indexOf('kanehira') < 0 && Hero.weapon !== 'kanehira') {
                Hero.items.push('kanehira');
                Dialog.start(DIALOGUE.post_kanehira, function () { saveGame(); maybeKancho(); });
              } else maybeKancho();
            });
          });
          return;
        }
        Dialog.start(DIALOGUE.mound, function () { ch1Seen.mound = true; checkCh1Done(); });
      }
      else if (id === 'michi') {
        if (!tutorialDone) {
          Dialog.start(DIALOGUE.ch1_michi, function () { unlockMeikan('michi'); startTransition(function () { startBattle({ gated: true }); }); });
        } else if (storyStage <= 1) {
          Dialog.start(DIALOGUE.ch2_battle, function () { storyStage = 2; unlockMeikan('hideyoshi'); unlockMeikan('ieyasu'); });
        } else if (storyStage === 2) {
          Dialog.start(DIALOGUE.ch3_deaths, function () { storyStage = 3; unlockMeikan('nagayoshi'); unlockMeikan('naomasa'); unlockZukan('shonyu'); });
        } else if (storyStage === 3) {
          Dialog.start(DIALOGUE.ch4_confrontation, function () { storyStage = 4; });
        } else if (storyStage === 4) {
          Dialog.start(DIALOGUE.ch5_tenka, function () { storyStage = 5; unlockMeikan('nobunaga'); });
        } else {
          Dialog.start(DIALOGUE.ch6_farewell, function () {
            // ハード: 第1形態撃破で「炎の舞」第2形態へ（背景の山が燃える・2回行動・特殊技）。
            // 敗北するとゲームオーバー（タイトルへ）。イージーは従来どおり勝敗不問でエピローグ
            var isHard = difficulty === 'hard';
            var toEpi = function () { startTransition(function () { setScene(makeEpilogue()); }); };
            startBattle({
              gated: false,
              enemy: {
                name: '踊り子', hp: 50, kind: 'odoriko',
                atkLabel: DIALOGUE.battle.odoriko.atkLabel, appearMsg: DIALOGUE.battle.odoriko.appearMsg,
                winMsg: DIALOGUE.battle.odoriko.winMsg,
                phase2: isHard ? { name: '踊り子 ―炎の舞―', hp: 280, atkLo: 10, atkHi: 15 } : null,
              },
              onWin: toEpi,
              onLose: isHard
                ? function () { startTransition(function () { setScene(makeTitle()); }); }
                : toEpi,
            });
          });
        }
      }
    }

    // ---------- 章イベント（zoneA: 一章〜三章） ----------
    function checkCh1Done() {
      if (mapKey !== 'zoneA' || chapter !== 'ch1') return;
      if (!(ch1Seen.mound && ch1Seen.shokuro && ch1Seen.museum)) return;
      chapter = 'ch2'; ch2step = 0; saveGame();
      Dialog.start(DIALOGUE.ch1_todomari, function () { runCh2(); });
    }
    function ikeActor(x, y, facing) {
      return { x: x, y: y, kind: 'ike', facing: facing || 'right', id: 'ike' };
    }
    // 二章はミニゲーム・戦闘でシーンをまたぐため、ch2step で再開位置を管理する
    function runCh2() {
      if (mapKey !== 'zoneA') return;
      if (ch2step === 0) {
        // いけ、茂みから登場（オダも広場西側へ歩み寄る）
        var ike = ikeActor(10 * TILE + TILE / 2, 10 * TILE + TILE / 2, 'right');
        sceneActors.push(ike);
        walkTo(player, 14 * TILE, 12 * TILE + TILE / 2, 132, function () {
        player.facing = 'left';
        walkTo(ike, 11 * TILE, 12 * TILE, 60, function () {
          Dialog.start(DIALOGUE.ch2_appear, function () {
            Dialog.start(DIALOGUE.ch2_kakugo, function () {
              Dialog.start(DIALOGUE.ch2_mai, function () {
                Dialog.start(DIALOGUE.ch2_katana, function () {
                  ch2step = 1; saveGame();
                  Dialog.start(DIALOGUE.ch2_hayakuchi_intro, function () {
                    setScene(makeHayakuchiGame(function () {
                      ch2step = 2; saveGame();
                      startTransition(function () { setScene(makeField('zoneA', { x: 13 * TILE, y: 12 * TILE + TILE / 2 }, null)); });
                    }));
                  });
                });
              });
            });
          });
        });
        });
      } else if (ch2step === 1) {
        // 早口言葉の途中でセーブ復帰した場合はミニゲームからやり直し
        Dialog.start(DIALOGUE.ch2_hayakuchi_intro, function () {
          setScene(makeHayakuchiGame(function () {
            ch2step = 2; saveGame();
            startTransition(function () { setScene(makeField('zoneA', { x: 13 * TILE, y: 12 * TILE + TILE / 2 }, null)); });
          }));
        });
      } else if (ch2step === 2) {
        // 早口言葉クリア後 → めがね → イオン → 走り出し → 追いかけっこ
        if (!findActor('ike')) sceneActors.push(ikeActor(11 * TILE, 12 * TILE, 'right'));
        player.facing = 'left';
        Dialog.start(DIALOGUE.ch2_hayakuchi_clear, function () {
          Dialog.start(DIALOGUE.ch2_megane, function () {
            Dialog.start(DIALOGUE.ch2_ion, function () {
              ch2step = 3; saveGame();
              Dialog.start(DIALOGUE.ch2_run1, function () {
                var ike3 = findActor('ike');
                if (!ike3) { sceneActors.push(ikeActor(11 * TILE, 12 * TILE, 'right')); ike3 = findActor('ike'); }
                walkTo(ike3, 30 * TILE, 14 * TILE, 260, function () {
                  setScene(makeChaseGame(function () {
                    ch2step = 4; saveGame();
                    startTransition(function () { setScene(makeField('zoneA', { col: 24, row: 14 }, null)); });
                  }));
                });
              });
            });
          });
        });
      } else if (ch2step === 3) {
        // 走り出し直前でセーブ復帰 → 追いかけっこから
        setScene(makeChaseGame(function () {
          ch2step = 4; saveGame();
          startTransition(function () { setScene(makeField('zoneA', { col: 24, row: 14 }, null)); });
        }));
      } else if (ch2step === 4) {
        // 待てー！ → 長久手市の使い宣言 → 腕試し（素手の型稽古）
        sceneActors.push(ikeActor(27 * TILE, 14 * TILE + TILE / 2, 'left'));
        player.facing = 'right';
        Dialog.start(DIALOGUE.ch2_mate, function () {
          Dialog.start(DIALOGUE.ch2_spar_intro, function () {
            unlockMeikan('ike');
            ch2step = 5; saveGame();
            startBattle({
              gated: false, spar: true,
              enemy: { name: '池田輝政', hp: 24, kind: 'ike', atkLabel: DIALOGUE.battle.ike_spar.atkLabel, winMsg: DIALOGUE.battle.ike_spar.winMsg, forcelose: true },
              onWin: function () { startTransition(function () { setScene(makeField('zoneA', { col: 24, row: 14 }, null)); }); },
              onLose: function () { startTransition(function () { setScene(makeField('zoneA', { col: 24, row: 14 }, null)); }); },
            });
          });
        });
      } else if (ch2step === 5) {
        // 腕試し後 → 110番 → 三章へ（オダは記念館へ向かう）
        sceneActors.push(ikeActor(27 * TILE, 14 * TILE + TILE / 2, 'down'));
        Dialog.start(DIALOGUE.ch2_after, function () {
          chapter = 'ch3'; saveGame();
        });
      }
    }
    // 三章: オダ不在の間の、いけとみちの再会 → ターミネーターオダ
    function startCh3Michi() {
      hidePlayer = true;
      camFocus = { x: 20 * TILE, y: 13 * TILE };
      var michi = { x: 10 * TILE + TILE / 2, y: 11 * TILE + TILE / 2, kind: 'michi', facing: 'right', id: 'michi' };
      sceneActors.push(michi);
      walkTo(michi, 24 * TILE, 14 * TILE + TILE / 2, 70, function () {
        Dialog.start(DIALOGUE.ch3_michi, function () {
          darkFx = true;
          hidePlayer = false;
          camFocus = null;
          player.x = 25 * TILE + TILE / 2; player.y = 8 * TILE; player.facing = 'down';
          walkTo(player, 25 * TILE + TILE / 2, 12 * TILE, 90, function () {
            Dialog.start(DIALOGUE.ch3_terminator, function () {
              darkFx = false;
              unlockMeikan('michi');
              Dialog.start(DIALOGUE.ch3_bridge, function () {
                chapter = 'main2'; stageP3 = 0; tutorialDone = true;
                if (storyStage < 1) storyStage = 1;
                saveGame();
                runP3(); // そのまま四章「戦トーク」へ（舞台は変わらず古戦場公園）
              });
            });
          });
        });
      });
    }

    // ---------- P3: 四章〜エピローグ（zoneA・直列進行） ----------
    // 進行段階に応じて必要なアクターを補充（既にいれば何もしない）
    function p3Actors(stage) {
      if (stage <= 5 && !findActor('michi')) sceneActors.push({ x: 18 * TILE, y: 14 * TILE + TILE / 2, kind: 'michi', facing: 'right', id: 'michi' });
      if (stage <= 7 && !findActor('ike')) {
        var ix = stage === 7 ? 7 * TILE : 22 * TILE, iy = stage === 7 ? 12.5 * TILE : 14 * TILE + TILE / 2;
        sceneActors.push(ikeActor(ix, iy, 'left'));
      }
      if (stage >= 6 && !findActor('dancer2')) {
        var dx3 = stage >= 9 ? 19.5 * TILE : 21 * TILE, dy3 = stage >= 9 ? 15 * TILE + TILE / 2 : 12.5 * TILE;
        sceneActors.push({ x: dx3, y: dy3, kind: 'odoriko', facing: 'down', alpha: 1, dancing: stage >= 9, id: 'dancer2' });
      }
    }
    function backToZoneA(col, row) {
      return function () { startTransition(function () { setScene(makeField('zoneA', { col: col, row: row }, null)); }); };
    }
    function runP3() {
      if (mapKey !== 'zoneA') return;
      p3Actors(stageP3);
      if (stageP3 === 0) {
        Dialog.start(DIALOGUE.ch4_intro, function () {
          unlockMeikan('hideyoshi'); unlockMeikan('ieyasu');
          // 現地取材クエストへ（原作セリフの間に挿入。5史跡を踏破すると戦トークが始まる）
          Dialog.start(DIALOGUE.ch4_junbi, function () {
            stageP3 = 1; saveGame();
          });
        });
      } else if (stageP3 === 1) {
        // 現地取材クエスト中。5史跡踏破後、みちに近づくと update() が進行させる
      } else if (stageP3 === 2) {
        setScene(makeSenTalk(function () { stageP3 = 3; saveGame(); backToZoneA(20, 13)(); }));
      } else if (stageP3 === 3) {
        Dialog.start(DIALOGUE.ch4_mononoke, function () {
          partyMembers.length = 0;
          partyMembers.push({ id: 'ike', name: 'いけ', kind: 'ike', maxhp: 26, atkLo: 3, atkHi: 5, aDef: 1 });
          partyMembers.push({ id: 'michi', name: 'みち', kind: 'michi', maxhp: 30, atkLo: 6, atkHi: 9, aDef: 1 });
          startBattle({
            gated: false,
            enemy: { name: 'はぐれ もののけ', hp: 34, kind: 'enemy', atkLabel: DIALOGUE.battle_mononoke_party.atkLabel, appearMsg: DIALOGUE.battle_mononoke_party.appearMsg, winMsg: DIALOGUE.battle_mononoke_party.winMsg },
            onWin: function () { partyMembers.length = 0; stageP3 = 4; saveGame(); backToZoneA(20, 13)(); },
            onLose: function () { partyMembers.length = 0; backToZoneA(20, 13)(); },
          });
        });
      } else if (stageP3 === 4) {
        Dialog.start(DIALOGUE.ch4_mononoke_after, function () {
          Dialog.start(DIALOGUE.ch5_kokuhaku, function () {
            unlockMeikan('nagayoshi'); unlockMeikan('naomasa'); unlockMeikan('tsuneoki');
            startBattle({
              gated: false,
              enemy: {
                name: 'みち', hp: 60, kind: 'michi', hideHp: true, noKO: true, roundLimit: 2,
                atkLabel: DIALOGUE.battle_michi_taiji.atkLabel, appearMsg: DIALOGUE.battle_michi_taiji.appearMsg,
                endMsg: DIALOGUE.battle_michi_taiji.endMsg, fleeMsg: DIALOGUE.battle_michi_taiji.fleeMsg,
                atkLo: 8, atkHi: 12,
              },
              onWin: function () { stageP3 = 5; saveGame(); backToZoneA(20, 13)(); },
              onLose: function () { stageP3 = 5; saveGame(); backToZoneA(20, 13)(); },
            });
          });
        });
      } else if (stageP3 === 5) {
        Dialog.start(DIALOGUE.ch5_tenka_full, function () {
          unlockMeikan('nobunaga');
          if (!findActor('dancer2')) sceneActors.push({ x: 21 * TILE, y: 12.5 * TILE, kind: 'odoriko', facing: 'down', alpha: 1, id: 'dancer2' });
          Dialog.start(DIALOGUE.ch6_ikitai, function () {
            Dialog.start(DIALOGUE.ch6_mirai, function () {
              var mi = findActor('michi');
              if (mi) {
                walkTo(mi, 10 * TILE, 11 * TILE, 150, function () {
                  var mi2 = findActor('michi'); if (mi2) mi2.fading = true;
                  stageP3 = 6; saveGame(); runP3();
                });
              } else { stageP3 = 6; saveGame(); runP3(); }
            });
          });
        });
      } else if (stageP3 === 6) {
        Dialog.start(DIALOGUE.ch6_stealth_intro, function () {
          setScene(makeStealthGame(function () {
            stageP3 = 7; saveGame();
            startTransition(function () { setScene(makeField('zoneA', { col: 8, row: 12 }, null)); });
          }));
        });
      } else if (stageP3 === 7) {
        Dialog.start(DIALOGUE.ch6_ochimusha, function () {
          var ik = findActor('ike');
          function proceed() { stageP3 = 8; saveGame(); runP3(); }
          if (ik) walkTo(ik, 10 * TILE, 10 * TILE, 90, function () { var ik2 = findActor('ike'); if (ik2) ik2.fading = true; proceed(); });
          else proceed();
        });
      } else if (stageP3 === 8) {
        var kan = { x: 25.5 * TILE, y: 8 * TILE, kind: 'kancho', facing: 'down', id: 'kancho' };
        sceneActors.push(kan);
        walkTo(kan, player.x + TILE, player.y - TILE, 100, function () {
          Dialog.start(DIALOGUE.epi_kancho, function () {
            // 好感度2以上で絆イベント（ハードの仲間加入条件）
            function afterBond() { proceedEpi(); }
            if (kanchoLove >= 2 && !kanchoBond) {
              kanchoBond = true;
              Dialog.start(DIALOGUE.epi_bond, function () { afterBond(); });
              return;
            }
            afterBond();
            function proceedEpi() {
            var k2 = findActor('kancho');
            if (k2) walkTo(k2, 25.5 * TILE, 8 * TILE, 110, function () { var k3 = findActor('kancho'); if (k3) k3.fading = true; });
            stageP3 = 9; saveGame();
            var dc = findActor('dancer2');
            if (dc) { dc.x = 19.5 * TILE; dc.y = 15 * TILE + TILE / 2; dc.dancing = true; }
            else sceneActors.push({ x: 19.5 * TILE, y: 15 * TILE + TILE / 2, kind: 'odoriko', facing: 'down', alpha: 1, dancing: true, id: 'dancer2' });
            }
          });
        });
      } else if (stageP3 === 9 && difficulty === 'hard' && !kanchoEv.p9hint) {
        // ハードのみ: 稼ぎ場解放と「鍛えてから挑め」のヒント（一度だけ）
        kanchoEv.p9hint = true; saveGame();
        Dialog.start(DIALOGUE.hard_patrol_hint);
      }
      // stageP3 === 9 は自由行動（見回り）。踊り子に話しかけると update() がラストバトルを起動する
    }

    let stepAcc = 0, encCooldown = 2.5, edgeHintT = 0;
    return {
      enter: function () {
        activeField = this;
        if (mapKey === 'field' || mapKey === 'zoneA') unlockZukan('kosenjo');
        if (mapKey === 'zoneB' && chapter === 'main2' && stageP3 === 1 && !kanchoEv.b) {
          kanchoEv.b = true; saveGame();
          var kb = { x: 26 * TILE, y: 16 * TILE, kind: 'kancho', facing: 'up', id: 'kancho_b' };
          sceneActors.push(kb);
          walkTo(kb, 20 * TILE, 2 * TILE, 130, function () { var kb2 = findActor('kancho_b'); if (kb2) kb2.fading = true; });
          Dialog.start([{ name: '', text: '——交差点の 向こうに、見覚えのある 後ろ姿。……館長！？' }], function () {
            Choice.start('（どうする？）', ['追いかける', '気のせいかな…'], function (pick) {
              if (pick === 0) {
                kanchoLove++; saveGame();
                Dialog.start([{ name: 'オダ', text: '館長ーー！！ ……あれ。角を 曲がったら、もう 誰も いない。（すれ違って しまったらしい）' }]);
              } else {
                Dialog.start([{ name: 'オダ', text: '（帰ったはずだし……きっと 気のせいだ。取材、取材。）' }]);
              }
            });
          });
        }
        if (mapKey === 'zoneA') {
          if (chapter === 'pro') {
            sceneActors.push({ x: 19.5 * TILE, y: 15 * TILE + TILE / 2, kind: 'odoriko', facing: 'down', alpha: 1, dancing: true, id: 'dancer' });
            Dialog.start(PROLOGUE_OPEN);
          } else if (chapter === 'ch1') {
            checkCh1Done();
          } else if (chapter === 'ch2') {
            runCh2();
          } else if (chapter === 'ch3') {
            sceneActors.push(ikeActor(27 * TILE, 14 * TILE + TILE / 2, 'down'));
            if (ch3rusu) startCh3Michi();
          } else if (chapter === 'main2') {
            runP3();
          }
          // chapter === 'post' はクリア後の自由散策（イベントなし）
        } else if (mapKey === 'museum' && chapter === 'ch3' && !ch3rusu) {
          Dialog.start(DIALOGUE.ch3_rusu, function () {
            Choice.start('（館長、どこに……）', ['心配だ。もう少し 探してみよう', 'さては、帰ったな…'], function (pick) {
              if (pick === 0) {
                kanchoLove++;
                Dialog.start([{ name: 'オダ', text: '（事務室の 電気は 消えてる。……戸締まりの 途中じゃないと いいけど。もう一周だけ、見ておこう）' }], function () { ch3rusu = true; saveGame(); });
              } else { ch3rusu = true; saveGame(); }
            });
          });
        } else if ((mapKey === 'bunka1' || mapKey === 'bunka2' || mapKey === 'mori') && !enteredFlavor.has(mapKey)) {
          enteredFlavor.add(mapKey);
          Dialog.start(mapKey === 'bunka1' ? DIALOGUE.bunka_galleria : (mapKey === 'bunka2' ? DIALOGUE.bunka_2f : DIALOGUE.bunka_mori));
        } else if (intro) {
          Dialog.start(intro);
          intro = null;
        }
      },
      update: function (dt) {
        updateParts(dt);
        var camU = camPos();
        spawnFieldParts(map.tileset, camU.x, camU.y);
        if (anim) { anim(dt); return; }
        if (Choice.active) { Choice.update(dt); return; }
        // 一章冒頭: 踊り子が資料を渡し、オダのセリフに入ったらすっと消えていく
        if (mapKey === 'zoneA' && chapter === 'ch1' && Dialog.active && Dialog.lines[Dialog.i] && Dialog.lines[Dialog.i].name === 'オダ') {
          for (var fk = 0; fk < sceneActors.length; fk++) { if (sceneActors[fk].kind === 'odoriko' && !sceneActors[fk].fading) sceneActors[fk].fading = true; }
        }
        for (var fi = sceneActors.length - 1; fi >= 0; fi--) {
          var fa = sceneActors[fi];
          if (fa.fading) { fa.alpha = Math.max(0, (fa.alpha || 1) - dt * 0.7); if (fa.alpha <= 0) sceneActors.splice(fi, 1); }
        }
        if (encCooldown > 0) encCooldown -= dt;
        if (Dialog.active) { Dialog.update(dt); return; }
        let dx = 0, dy = 0;
        if (Input.down('left')) dx -= 1;
        if (Input.down('right')) dx += 1;
        if (Input.down('up')) dy -= 1;
        if (Input.down('down')) dy += 1;
        if (dx !== 0 && dy !== 0) {
          player.facing = (dy < 0 ? 'up' : 'down') + '-' + (dx < 0 ? 'left' : 'right');
        } else if (dx < 0) player.facing = 'left'; else if (dx > 0) player.facing = 'right';
        else if (dy < 0) player.facing = 'up'; else if (dy > 0) player.facing = 'down';
        player.moving = dx !== 0 || dy !== 0;
        const sp = SPEED * dt;
        if (dx !== 0) { const nx = player.x + dx * sp; if (canWalk(nx, player.y)) player.x = nx; }
        if (dy !== 0) { const ny = player.y + dy * sp; if (canWalk(player.x, ny)) player.y = ny; }
        // ゾーン端のシームレス移動（おまけフィールド。エピローグの見回り以降に解放）
        if (map.def.edges) {
          if (edgeHintT > 0) edgeHintT -= dt;
          var edgeDir = null;
          if (player.x < HALF + 2 && map.def.edges.west) edgeDir = 'west';
          else if (player.x > map.pxW - HALF - 2 && map.def.edges.east) edgeDir = 'east';
          else if (player.y < HALF + 2 && map.def.edges.north) edgeDir = 'north';
          else if (player.y > map.pxH - HALF - 2 && map.def.edges.south) edgeDir = 'south';
          if (edgeDir) {
            if (omakeUnlocked()) {
              var toKey = map.def.edges[edgeDir];
              var tw2 = MAP_DEFS[toKey].rows[0].length * TILE, th2 = MAP_DEFS[toKey].rows.length * TILE;
              var sx2 = player.x, sy2 = player.y;
              if (edgeDir === 'west') sx2 = tw2 - TILE * 0.8;
              if (edgeDir === 'east') sx2 = TILE * 0.8;
              if (edgeDir === 'north') sy2 = th2 - TILE * 0.8;
              if (edgeDir === 'south') sy2 = TILE * 0.8;
              sx2 = Math.max(TILE * 0.6, Math.min(tw2 - TILE * 0.6, sx2));
              sy2 = Math.max(TILE * 0.6, Math.min(th2 - TILE * 0.6, sy2));
              setScene(makeField(toKey, { x: sx2, y: sy2 }, null));
              return;
            } else if (edgeHintT <= 0) {
              edgeHintT = 4;
              Dialog.start(DIALOGUE.omake_locked);
            }
          }
        }
        // ハードの稼ぎ場: ラスボス前の見回り（stageP3=9）とクリア後は、街の各ゾーンでも夜行のもののけが出る
        const patrolEnc = !map.def.encounter && difficulty === 'hard'
          && (mapKey === 'zoneA' || mapKey === 'zoneB' || mapKey === 'zoneC' || mapKey === 'zoneD')
          && ((chapter === 'main2' && stageP3 === 9) || chapter === 'post') ? { rate: 0.05 } : null;
        const encDef = map.def.encounter || patrolEnc;
        if ((dx !== 0 || dy !== 0) && tutorialDone && encDef && encCooldown <= 0) {
          stepAcc += sp;
          if (stepAcc > 40) {
            stepAcc = 0;
            const tc = Math.floor(player.x / TILE), tr = Math.floor(player.y / TILE);
            const t = map.grid[tr] && map.grid[tr][tc];
            const encRate = encDef.rate * DIFF[difficulty].encRate;
            if ((t === '.' || t === ',') && Math.random() < encRate) {
              encCooldown = 3.5;
              startTransition(function () {
                // 夜行のもののけは経験値・報酬が多め（第2形態に向けたレベル上げ用）
                startBattle(patrolEnc ? { gated: false, enemy: { name: '夜行の もののけ', hp: 36, atkLo: 6, atkHi: 10, expReward: [16, 22], goldReward: [180, 260] } } : { gated: false });
              });
              return;
            }
          }
        }
        if (mapKey === 'zoneA' && chapter === 'pro' && !proTriggered) {
          var la = findActor('dancer');
          if (la) {
            var ldx = player.x - la.x, ldy = player.y - la.y;
            if (ldx * ldx + ldy * ldy < (TILE * 1.8) * (TILE * 1.8)) {
              proTriggered = true;
              player.facing = 'up'; player.moving = false; la.dancing = false;
              // 舞の終わり——照明と音で「世界が変わる」（原作ト書きの時空切替演出）
              startTransition(function () { zoneAMood = 'weird'; });
              for (var pp = 0; pp < 8; pp++) {
                emitP(player.x + (Math.random() - 0.5) * 22, player.y - 8, (Math.random() - 0.5) * 34, -22 - Math.random() * 22, 1.3 + Math.random(), 'rgba(245,240,222,0.95)', 2 + Math.random() * 1.5, 60);
              }
              Dialog.start(PROLOGUE_MEET, function () {
                chapter = 'ch1'; saveGame();
                Dialog.start(DIALOGUE.ch1_open);
              });
            }
          }
        }
        // 四章クエスト: 待機中のいけ・みちに話しかける／5史跡踏破後にみちへ近づくと戦トークへ
        if (mapKey === 'zoneA' && chapter === 'main2' && stageP3 === 1) {
          var mAct = findActor('michi'), iAct = findActor('ike');
          if (junbiCleared() && !proTriggered && mAct) {
            var qdx = player.x - mAct.x, qdy = player.y - mAct.y;
            if (qdx * qdx + qdy * qdy < (TILE * 3) * (TILE * 3)) {
              proTriggered = true;
              Dialog.start(DIALOGUE.ch4_junbi_done, function () {
                stageP3 = 2; saveGame();
                setScene(makeSenTalk(function () { stageP3 = 3; saveGame(); backToZoneA(20, 13)(); }));
              });
              return;
            }
          }
          if (Input.pressed('confirm')) {
            var nearW = null;
            var cands = [mAct, iAct];
            for (var ci = 0; ci < cands.length; ci++) {
              var ca = cands[ci];
              if (!ca) continue;
              var cdx = player.x - ca.x, cdy = player.y - ca.y;
              if (cdx * cdx + cdy * cdy < (TILE * 1.6) * (TILE * 1.6)) nearW = ca;
            }
            if (nearW) {
              var waitLines = (nearW.id === 'ike' ? DIALOGUE.ch4_wait_ike : DIALOGUE.ch4_wait_michi)
                .concat([{ name: '', text: '（現地取材: ' + junbiCount() + ' / 5 史跡を 踏破。色金山・血の池・武蔵塚・安昌寺は 北の 岩作エリアに。御旗山は 西の 市街地の 南に）' }]);
              Dialog.start(waitLines);
              return;
            }
          }
        }
        // エピローグ: 見回り中、舞う踊り子に「話しかける」とラストバトル（誤発動防止のため決定キー式）
        if (mapKey === 'zoneA' && chapter === 'main2' && stageP3 === 9 && !proTriggered && Input.pressed('confirm')) {
          var dz = findActor('dancer2');
          if (dz) {
            var zdx = player.x - dz.x, zdy = player.y - dz.y;
            if (zdx * zdx + zdy * zdy < (TILE * 1.8) * (TILE * 1.8)) {
              proTriggered = true;
              player.facing = 'up'; player.moving = false;
              Dialog.start(DIALOGUE.epi_odoriko, function () {
                partyMembers.length = 0;
                // ハード: 第1形態撃破で「炎の舞」第2形態へ（山が燃える・2回行動・特殊技）。
                // 敗北するとゲームオーバー（タイトルへ）。イージーは従来どおり勝敗不問でエピローグ
                var isHard = difficulty === 'hard';
                startBattle({
                  gated: false,
                  enemy: {
                    name: '踊り子', hp: 60, kind: 'odoriko',
                    atkLabel: DIALOGUE.battle.odoriko.atkLabel, appearMsg: DIALOGUE.battle.odoriko.appearMsg,
                    winMsg: DIALOGUE.battle.odoriko.winMsg,
                    phase2: isHard ? { name: '踊り子 ―炎の舞―', hp: 280, atkLo: 10, atkHi: 15 } : null,
                  },
                  onWin: function () { finishGame(); },
                  onLose: isHard
                    ? function () { startTransition(function () { setScene(makeTitle()); }); }
                    : function () { finishGame(); },
                });
              });
              function finishGame() {
                chapter = 'post'; saveGame();
                startTransition(function () {
                  setScene({
                    enter: function () { Dialog.start(DIALOGUE.epi_maku, function () { startTransition(function () { setScene(makeEnding()); }); }); },
                    update: function (dt) { if (Dialog.active) Dialog.update(dt); },
                    render: function (c) { c.fillStyle = '#04050c'; c.fillRect(0, 0, W, H); if (Dialog.active) Dialog.render(c); },
                  });
                });
              }
            }
          }
        }
        // 三章: ひれ伏しているいけに話しかけられる
        if (mapKey === 'zoneA' && chapter === 'ch3' && Input.pressed('confirm')) {
          var ika = findActor('ike');
          if (ika) {
            var idx2 = player.x - ika.x, idy2 = player.y - ika.y;
            if (idx2 * idx2 + idy2 * idy2 < (TILE * 1.6) * (TILE * 1.6)) { Dialog.start(DIALOGUE.ch2_ike_wait); return; }
          }
        }
        if (Input.pressed('confirm')) interact();
        if (Input.pressed('cancel')) setScene(makeMenu(activeField));
      },
      render: function (c) {
        var cam = camPos();
        c.save(); c.translate(-cam.x, -cam.y);
        drawFieldWorld(c, map, hidePlayer ? null : player, cam.x, cam.y);
        for (let i = 0; i < sceneActors.length; i++) {
          const a = sceneActors[i];
          if (a.kind === 'odoriko' && ODORIKO_BATTLE_IMG) {
            var oh = TILE * 3, ow = oh * (ODORIKO_BATTLE_IMG.width / ODORIKO_BATTLE_IMG.height);
            c.save(); c.globalAlpha = a.alpha != null ? a.alpha : 1;
            if (a.dancing) {
              var footX = a.x, footY = a.y + TILE / 2, bob = Math.sin(tick * 0.09) * 2.5;
              c.translate(footX, footY); c.rotate(Math.sin(tick * 0.045) * 0.07); c.translate(-footX, -footY);
              c.drawImage(ODORIKO_BATTLE_IMG, a.x - ow / 2, a.y - oh + TILE / 2 + bob, ow, oh);
            } else {
              c.drawImage(ODORIKO_BATTLE_IMG, a.x - ow / 2, a.y - oh + TILE / 2, ow, oh);
            }
            c.restore();
          } else {
            drawActor(c, a.x, a.y, a.kind, a.facing, 1, a.moving, a.alpha);
          }
        }
        drawFieldAtmoWorld(c, map);
        drawParts(c);
        c.restore();
        drawFieldAtmoScreen(c, map);
        // ターミネーターオダ演出: 暗闇＋懐中電灯の灯りだけがオダを照らす（原作ト書き準拠）
        if (darkFx) {
          c.fillStyle = 'rgba(2,2,8,0.85)'; c.fillRect(0, 0, W, H);
          c.save(); c.translate(-cam.x, -cam.y);
          drawLightPool(c, player.x, player.y - 8, 70, 'rgba(255,240,200,1)', 0.5);
          drawActor(c, player.x, player.y, player.kind, player.facing, 1, player.moving);
          c.restore();
        }
        // 操作ヒント（誰でもメニューにたどり着けるように常時表示）
        if (!Dialog.active && !Choice.active && !darkFx) {
          c.fillStyle = 'rgba(6,10,24,0.6)'; roundRect(c, W - 190, 8, 182, 24, 8); c.fill();
          c.fillStyle = '#cdd9ff'; c.font = '11px "Hiragino Sans",sans-serif'; c.textAlign = 'left';
          c.fillText('Ｚ：しらべる　Ｘ／Ｂ：メニュー', W - 180, 24);
        }
        drawVignette(c); if (Dialog.active) Dialog.render(c);
        if (Choice.active) Choice.render(c);
      },
    };
  }

  // ===================== Battle scene =====================
  // パーティ戦闘（最大3人）。allies[0] は常にオダ。
  // 全滅条件はオダのHP0（仲間が倒れても戦闘は続く）。経験値・レベルはオダに集約。
  function startBattle(opts) {
    opts = opts || {};
    const gated = !!opts.gated;
    const e = opts.enemy || {};
    const dm = DIFF[difficulty];
    const hp = Math.max(1, Math.round((e.hp || 22) * dm.enemyHp));
    const enemy = {
      name: e.name || '落武者のもののけ', hp: hp, maxhp: hp, broken: false, weakKnown: !gated, shake: 0,
      kind: e.kind || 'enemy', spar: !!opts.spar, forcelose: !!e.forcelose,
      atkLabel: e.atkLabel || DIALOGUE.battle.random.atkLabel, winMsg: e.winMsg || DIALOGUE.battle.random.winMsg,
      loseMsg: e.loseMsg || null, appearMsg: e.appearMsg || null,
      atkMul: dm.enemyAtk,
      // イベント戦用: roundLimit=Nラウンドで endMsg を表示して終了（勝ち扱い）。
      // noKO=味方はHP1で耐える。hideHp=敵HPバー非表示。fleeMsg=にげる時の専用セリフ。
      roundLimit: e.roundLimit || 0, noKO: !!e.noKO, endMsg: e.endMsg || null,
      hideHp: !!e.hideHp, fleeMsg: e.fleeMsg || null,
      atkLo: e.atkLo || 3, atkHi: e.atkHi || 6,
      // 拡張: acts=1ターンの行動回数, specials=特殊技（乱れ舞/幻惑/緋の舞）,
      // phase2=撃破時に第2形態へ移行（ハードのラスボス用）, expReward/goldReward=[lo,hi]で報酬上書き
      acts: e.acts || 1, specials: !!e.specials, phase2: e.phase2 || null,
      expReward: e.expReward || null, goldReward: e.goldReward || null,
    };
    const allies = [{
      id: 'oda', name: 'オダ', kind: 'oda', isOda: true,
      hp: Hero.maxhp, maxhp: Hero.maxhp, lv: Hero.lv, miyaLv: miyaLvFromLv(Hero.lv),
      atkBonus: Hero.atkBonus, wAtk: weaponAtk(), aDef: armorDef(),
    }];
    partyMembers.forEach(function (m) {
      allies.push({ id: m.id, name: m.name, kind: m.kind, isOda: false, hp: m.maxhp, maxhp: m.maxhp, atkLo: m.atkLo, atkHi: m.atkHi, aDef: m.aDef || 0 });
    });
    setScene(makeBattle(enemy, allies, gated,
      opts.onWin || function () { startTransition(function () { setScene(activeField); }); },
      opts.onLose || function () { startTransition(function () { setScene(makeTitle()); }); }));
  }
  function makeBattle(enemy, allies, gated, onWin, onLose) {
    const player = allies[0]; // オダ（forcelose/spar/みやぶる はオダ基準）
    function commandsFor(a) {
      if (!a.isOda) return ['たたかう', 'にげる'];
      return bagCount() > 0 ? ['たたかう', 'みやぶる', 'どうぐ', 'にげる'] : ['たたかう', 'みやぶる', 'にげる'];
    }
    let turnIdx = 0;
    let commands = commandsFor(player);
    let cursor = 0;
    let mode = 'msg';
    let msg = '';
    let after = null;
    let endKind = null;
    let shake = 0, flash = 0;
    const popups = [];

    function showMsg(t, fn) { mode = 'msg'; msg = t; after = fn || null; }
    function openMenu() { mode = 'menu'; msg = ''; commands = commandsFor(allies[turnIdx]); if (cursor >= commands.length) cursor = 0; }
    function addPopup(text, x, y, color) { popups.push({ text: text, x: x, y: y, life: 1.0, color: color }); }
    function hitEnemy(dmg, crit) {
      enemy.hp -= dmg; if (enemy.hp < 0) enemy.hp = 0;
      enemy.shake = crit ? 0.5 : 0.3;
      flash = crit ? 0.5 : 0.28;
      if (crit) shake = 7;
      addPopup((crit ? '会心 ' : '') + dmg, W / 2, 150, crit ? '#ffd43b' : '#fff');
    }
    function hitAlly(a, dmg) {
      a.hp -= dmg; if (a.hp < 0) a.hp = 0;
      if (enemy.noKO && a.hp <= 0) a.hp = 1; // イベント戦: 倒れない
      shake = 5; flash = 0.2;
      addPopup('' + dmg, 110, 250, '#ff8787');
    }
    let rounds = 0; // イベント戦（roundLimit）用
    function aliveAllies() { return allies.filter(function (a) { return a.hp > 0; }); }
    function loseCheck(then) {
      // 全滅条件 = オダのHP0
      if (player.hp <= 0) {
        if (enemy.spar) showMsg('オダは 膝を ついた…！\nいけ「はは、まだまだ だな。…だが、筋は 悪くない」', function () { mode = 'end'; endKind = 'win'; msg = '（Z / タップで つづける）'; });
        else showMsg('オダは目の前が真っ暗に…！', function () { mode = 'end'; endKind = 'lose'; msg = enemy.loseMsg || '気を失った…（Z / タップで タイトルへ）'; });
      } else then();
    }
    // 味方の手番を進める。全員行動したら敵の手番へ。
    function nextTurn() {
      if (enemy.hp <= 0) { winSequence(); return; }
      turnIdx++;
      while (turnIdx < allies.length && allies[turnIdx].hp <= 0) turnIdx++;
      if (turnIdx >= allies.length) { turnIdx = 0; enemyTurn(); }
      else openMenu();
    }
    function startRound() {
      turnIdx = 0;
      while (turnIdx < allies.length && allies[turnIdx].hp <= 0) turnIdx++;
      if (turnIdx >= allies.length) turnIdx = 0;
      openMenu();
    }
    // ハードのラスボス: 第1形態を倒すと第2形態へ。山が燃える背景にフェードし、いけ・みちが駆けつける
    function startPhase2() {
      const p2 = enemy.phase2; enemy.phase2 = null;
      const B2 = DIALOGUE.battle_odoriko2;
      enemy.firePhase = true; // update() が fireT を 0→1 へフェード（燃える山の背景）
      const seq = [B2.intro1, B2.intro2, B2.joinIke, B2.joinMichi];
      const joins = [
        { id: 'ike', name: 'いけ', kind: 'ike', maxhp: 34, atkLo: 9, atkHi: 14, aDef: 1 },
        { id: 'michi', name: 'みち', kind: 'michi', maxhp: 36, atkLo: 8, atkHi: 12, aDef: 1 },
      ];
      if (kanchoBond) { joins.push({ id: 'kancho', name: '館長', kind: 'kancho', maxhp: 30, atkLo: 6, atkHi: 10, aDef: 1 }); seq.push(B2.joinKancho); }
      joins.forEach(function (m) {
        allies.push({ id: m.id, name: m.name, kind: m.kind, isOda: false, hp: m.maxhp, maxhp: m.maxhp, atkLo: m.atkLo, atkHi: m.atkHi, aDef: m.aDef });
      });
      seq.push(B2.intro3);
      enemy.name = p2.name; enemy.hp = p2.hp; enemy.maxhp = p2.hp;
      enemy.atkLo = p2.atkLo; enemy.atkHi = p2.atkHi;
      enemy.acts = 2; enemy.specials = true;
      enemy.atkLabel = B2.atkLabel; enemy.winMsg = B2.winMsg;
      enemy.fleeMsg = B2.fleeMsg; enemy.loseMsg = B2.loseMsg;
      enemy.expReward = [40, 60]; enemy.goldReward = [2500, 3000];
      enemy.broken = false; enemy.shake = 0.6;
      let i = 0;
      function step() { if (i < seq.length) showMsg(seq[i++], step); else startRound(); }
      step();
    }
    function winSequence() {
      if (enemy.phase2) { startPhase2(); return; }
      if (gated) { tutorialDone = true; storyStage = 1; }
      const reward = enemy.expReward ? rnd(enemy.expReward[0], enemy.expReward[1]) : rnd(5, 8);
      const goldGain = enemy.goldReward ? rnd(enemy.goldReward[0], enemy.goldReward[1]) : rnd(80, 150);
      Hero.exp += reward;
      gold += goldGain;
      const seq = [enemy.winMsg, '経験値を ' + reward + '、' + goldGain + '円を 手に入れた！'];
      while (Hero.exp >= expToNext(Hero.lv)) {
        Hero.exp -= expToNext(Hero.lv);
        const before = miyaLvFromLv(Hero.lv);
        Hero.lv++;
        Hero.maxhp += 5; Hero.atkBonus += 1;
        const miyaUp = miyaLvFromLv(Hero.lv) > before;
        seq.push('オダは レベル ' + Hero.lv + ' に上がった！\n最大HP＋5　こうげき＋1' + (miyaUp ? '\nみやぶるが いちだん 冴えてきた！' : ''));
      }
      let i = 0;
      function step() {
        if (i < seq.length) showMsg(seq[i++], step);
        else { mode = 'end'; endKind = 'win'; msg = '（Z / タップで つづける）'; }
      }
      step();
    }
    function enemyTurn() {
      if (enemy.hp <= 0) { winSequence(); return; }
      if (enemy.forcelose) {
        var fdmg = rnd(14, 18); hitAlly(player, fdmg);
        showMsg(enemy.atkLabel + '！\nオダは ' + fdmg + 'の ダメージ！', function () { loseCheck(startRound); });
        return;
      }
      rounds++;
      if (player.atkDownT > 0) player.atkDownT--; // 幻惑の舞の残りターンを消化
      // イベント戦: 規定ラウンドで幕引き（勝ち扱い）
      const finish = (enemy.roundLimit && rounds >= enemy.roundLimit)
        ? function () { showMsg(enemy.endMsg || '……戦いは、ふいに 終わった。', function () { mode = 'end'; endKind = 'win'; msg = '（Z / タップで つづける）'; }); }
        : function () { loseCheck(startRound); };
      // acts=2 なら1ターンに2回行動（第2形態）。各行動後に全滅判定を挟む
      let acted = 0;
      const nActs = enemy.acts || 1;
      function nextAct() {
        if (acted >= nActs) { finish(); return; }
        acted++;
        doOneAct(function () { loseCheck(nextAct); });
      }
      function doOneAct(done) {
        const alive = aliveAllies();
        const target = alive[rnd(0, alive.length - 1)] || player;
        if (enemy.specials) {
          const roll = Math.random();
          if (roll < 0.18) { // 乱れ舞: 全体攻撃
            const parts = [];
            for (var ai = 0; ai < alive.length; ai++) {
              var aa = alive[ai];
              var d = Math.max(1, Math.round(rnd(enemy.atkLo, enemy.atkHi) * (enemy.atkMul || 1) * 0.62) - aa.aDef);
              aa.hp -= d; if (aa.hp < 0) aa.hp = 0;
              if (enemy.noKO && aa.hp <= 0) aa.hp = 1; // イベント戦: 倒れない（hitAlly と同じ扱い）
              parts.push(aa.name + 'に' + d);
            }
            shake = 6; flash = 0.32;
            showMsg(enemy.name + 'の【乱れ舞】！ 炎の輪が 全員を 薙ぎはらう！\n' + parts.join('、') + ' の ダメージ！', done);
            return;
          }
          if (roll < 0.30 && !(player.atkDownT > 0)) { // 幻惑の舞: 攻撃力デバフ
            player.atkDownT = 2;
            showMsg(enemy.name + 'の【幻惑の舞】！ 妖しい 舞に 目が くらむ…！\nみんなの こうげきの力が 下がった！（2ターン）', done);
            return;
          }
          if (roll < 0.42) { // 緋の舞: 強力な単体攻撃
            const d2 = Math.max(1, Math.round(rnd(enemy.atkLo, enemy.atkHi) * (enemy.atkMul || 1) * 1.55) - target.aDef);
            hitAlly(target, d2);
            showMsg(enemy.name + 'の【緋の舞】！ 燃える袖が ' + target.name + 'を 薙ぐ！\n' + d2 + 'の 大ダメージ！', done);
            return;
          }
        }
        if (Math.random() < (enemy.specials ? 0.12 : 0.22)) { showMsg(enemy.atkLabel + '！\n' + target.name + 'は ひらりと身をかわした！', done); return; }
        const dmg = Math.max(1, Math.round(rnd(enemy.atkLo, enemy.atkHi) * (enemy.atkMul || 1)) - target.aDef); hitAlly(target, dmg);
        showMsg(enemy.atkLabel + '！ ' + target.name + 'は ' + dmg + 'のダメージ！', done);
      }
      nextAct();
    }
    function miyaTier(lv) {
      const r = Math.random();
      if (lv >= 3) { if (r < 0.30) return 0; if (r < 0.75) return 1; return 2; }
      if (lv >= 2) { if (r < 0.55) return 0; if (r < 0.92) return 1; return 2; }
      if (r < 0.82) return 0; return 1;
    }
    function actorTurn(cmdIdx) {
      const actor = allies[turnIdx];
      const cmd = commands[cmdIdx];
      if (cmd === 'たたかう') {
        if (enemy.forcelose) { showMsg(actor.name + 'の こうげき！\nしかし いけは 軽く 受け流した！', nextTurn); return; }
        if (!enemy.weakKnown && actor.isOda) { showMsg('オダのこうげき！\nしかし手ごたえがない…！ まず「みやぶる」で 弱点を さがそう。', nextTurn); return; }
        if (Math.random() < 0.16) { showMsg(actor.name + 'のこうげき！\nしかし攻撃は 空を切った…！', nextTurn); return; }
        let dmg = actor.isOda ? (rnd(5, 8) + actor.atkBonus + actor.wAtk) : rnd(actor.atkLo || 4, actor.atkHi || 7);
        if (player.atkDownT > 0) dmg = Math.max(1, Math.floor(dmg * 0.65)); // 幻惑の舞
        if (enemy.broken) dmg += 3;
        const crit = Math.random() < 0.18;
        if (crit) { dmg = Math.floor(dmg * 1.8); hitEnemy(dmg, true); showMsg(actor.name + 'のこうげき！ 急所に当たった！\n' + dmg + 'の大ダメージ！', nextTurn); }
        else { hitEnemy(dmg, false); showMsg(actor.name + 'のこうげき！ ' + dmg + 'のダメージ！', nextTurn); }
      } else if (cmd === 'みやぶる') {
        if (enemy.forcelose) { showMsg('オダは 相手を みやぶろうとした！\nしかし いけは まるで 隙を 見せない…！', nextTurn); return; }
        enemy.broken = true; enemy.weakKnown = true;
        const tier = miyaTier(player.miyaLv);
        if (enemy.kind === 'enemy') {
          if (tier === 0) {
            showMsg('オダは敵をみやぶった！\n「この子…戦で散った兵の無念か…」\n弱点が見えた！（守りが下がった）', nextTurn);
          } else if (tier === 1) {
            const d = 5; hitEnemy(d, false); showMsg('オダの観察眼が冴えた！【みやぶる＋】\n「落武者は“塚”に心を残してる…」\n心の隙を突いた！ ' + d + 'のダメージ！', nextTurn);
          } else {
            const d = 9; hitEnemy(d, false); showMsg('オダは心眼を開いた！【みやぶる・極】\n「無念は ちゃんと残ってる。もう休んで」\n落武者の心がやわらいだ！ ' + d + 'のダメージ！', nextTurn);
          }
        } else {
          if (tier === 0) {
            showMsg('オダは 相手を みやぶった！\n構えの 隙が 見えた！（守りが下がった）', nextTurn);
          } else if (tier === 1) {
            const d = 5; hitEnemy(d, false); showMsg('オダの 観察眼が 冴えた！【みやぶる＋】\n隙を 突いた！ ' + d + 'のダメージ！', nextTurn);
          } else {
            const d = 9; hitEnemy(d, false); showMsg('オダは 心眼を 開いた！【みやぶる・極】\n完全に 見切った！ ' + d + 'のダメージ！', nextTurn);
          }
        }
      } else if (cmd === 'どうぐ') {
        // 回復量が大きく減っているなら長久手茶を優先、そうでなければおにぎり
        var useKey = null;
        var deficit = actor.maxhp - actor.hp;
        if (bag.cha > 0 && deficit >= 35) useKey = 'cha';
        else if (bag.hyorogan > 0 && deficit >= 20) useKey = 'hyorogan';
        else if (bag.onigiri > 0) useKey = 'onigiri';
        else if (bag.hyorogan > 0) useKey = 'hyorogan';
        else if (bag.cha > 0) useKey = 'cha';
        if (!useKey) { showMsg('どうぐを 何も 持っていない！', openMenu); return; }
        bag[useKey]--;
        var healed = Math.min(GOODS[useKey].heal, deficit);
        actor.hp += healed;
        showMsg('オダは ' + GOODS[useKey].name + 'を つかった！\nHPが ' + healed + ' 回復した！', nextTurn);
      } else {
        showMsg(enemy.fleeMsg || (enemy.spar ? 'いけ「逃げるな、オダ！ これも 修行だ！」' : 'みち「逃げるな、お前！ ここで覚えるんだよ！」'), nextTurn);
      }
    }

    return {
      enter: function () { showMsg(enemy.spar ? 'いけが 構えた！ 腕試しだ！' : (enemy.appearMsg || DIALOGUE.battle.random.appearMsg), startRound); },
      update: function (dt) {
        updateParts(dt);
        spawnBattleParts();
        // 第2形態: 燃える山の背景へ約3秒かけてクロスフェード＋火の粉
        if (enemy.firePhase && (enemy.fireT || 0) < 1) enemy.fireT = Math.min(1, (enemy.fireT || 0) + dt / 3);
        if ((enemy.fireT || 0) > 0.25 && tick % 7 === 0) {
          emitP(Math.random() * W, 196 + Math.random() * 10, (Math.random() - 0.5) * 16, -22 - Math.random() * 34, 1.5, 'rgba(255,150,60,0.75)', 1.8, -8);
        }
        if (shake > 0) { shake -= dt * 30; if (shake < 0) shake = 0; }
        if (flash > 0) { flash -= dt * 1.6; if (flash < 0) flash = 0; }
        if (enemy.shake > 0) { enemy.shake -= dt; if (enemy.shake < 0) enemy.shake = 0; }
        for (let i = popups.length - 1; i >= 0; i--) { const p = popups[i]; p.y -= dt * 38; p.life -= dt * 1.1; if (p.life <= 0) popups.splice(i, 1); }
        if (mode === 'menu') {
          if (Input.pressed('up')) cursor = (cursor + commands.length - 1) % commands.length;
          if (Input.pressed('down')) cursor = (cursor + 1) % commands.length;
          if (Input.pressed('confirm')) actorTurn(cursor);
        } else if (mode === 'msg') {
          if (Input.pressed('confirm')) { const fn = after; after = null; if (fn) fn(); }
        } else if (mode === 'end') {
          if (Input.pressed('confirm')) { if (endKind === 'win') onWin(); else onLose(); }
        }
      },
      render: function (c) { drawBattle(c, enemy, allies, turnIdx, commands, cursor, mode, msg, shake, flash, popups); drawParts(c); },
    };
  }
  function drawBattle(c, enemy, allies, turnIdx, commands, cursor, mode, msg, shake, flash, popups) {
    const player = allies[0];
    var g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#100818'); g.addColorStop(0.35, '#1a0f22'); g.addColorStop(0.7, '#150e1c'); g.addColorStop(1, '#0c0a14');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    // Stars
    c.fillStyle = 'rgba(255,255,255,0.55)';
    for (var si = 0; si < 50; si++) {
      var stx = (si * 374761 + 127) % W, sty = (si * 668265 + 43) % 175;
      var sts = ((si * 7 + 3) % 4) * 0.3 + 0.4;
      c.fillRect(stx, sty, sts, sts);
    }
    // Twinkling stars
    for (var si = 0; si < 6; si++) {
      if ((tick + si * 17) % 40 < 10) {
        var stx2 = ((si + 50) * 374761 + 211) % W, sty2 = ((si + 50) * 668265 + 97) % 150;
        c.fillStyle = 'rgba(200,210,255,0.35)';
        c.fillRect(stx2 - 1.5, sty2, 4, 1); c.fillRect(stx2, sty2 - 1.5, 1, 4);
      }
    }
    // 月（満月＋暈。第2形態の炎の空では自然に赤に沈む）
    var mnx = W - 84, mny = 52;
    c.save(); c.globalCompositeOperation = 'lighter';
    var mng = c.createRadialGradient(mnx, mny, 0, mnx, mny, 44);
    mng.addColorStop(0, 'rgba(220,228,255,0.22)'); mng.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = mng; c.beginPath(); c.arc(mnx, mny, 44, 0, Math.PI * 2); c.fill();
    c.restore();
    c.fillStyle = '#e6ebf8'; c.beginPath(); c.arc(mnx, mny, 13, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(170,182,210,0.55)';
    c.beginPath(); c.arc(mnx - 4, mny - 3, 3, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(mnx + 4, mny + 4, 2, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(mnx + 2, mny - 5, 1.5, 0, Math.PI * 2); c.fill();
    // Distant hills silhouette
    c.fillStyle = '#0e1520';
    c.beginPath(); c.moveTo(0, 180);
    c.quadraticCurveTo(80, 155, 160, 172); c.quadraticCurveTo(260, 150, 360, 168);
    c.quadraticCurveTo(440, 155, W, 175); c.lineTo(W, 200); c.lineTo(0, 200); c.closePath(); c.fill();
    c.fillStyle = '#121e12';
    c.beginPath(); c.moveTo(0, 188);
    c.quadraticCurveTo(120, 172, 256, 182); c.quadraticCurveTo(380, 170, W, 185);
    c.lineTo(W, 200); c.lineTo(0, 200); c.closePath(); c.fill();
    // 第2形態: 燃え盛る山なみ（原作上演の山焼け演出）。fireT でクロスフェード
    var ft = enemy.fireT || 0;
    if (ft > 0) {
      c.save(); c.globalAlpha = ft;
      // 赤黒い空
      var fsky = c.createLinearGradient(0, 0, 0, 200);
      fsky.addColorStop(0, '#160303'); fsky.addColorStop(0.55, '#471006'); fsky.addColorStop(1, '#7d2408');
      c.fillStyle = fsky; c.fillRect(0, 0, W, 200);
      // 舞い散る火の粉（空側・点滅）
      for (var ei = 0; ei < 24; ei++) {
        var ex2 = (ei * 374761 + 59) % W, ey2 = (ei * 668265 + 31) % 165;
        var tw = 0.25 + 0.55 * Math.abs(Math.sin(tick * 0.07 + ei * 1.3));
        c.fillStyle = 'rgba(255,170,80,' + tw + ')';
        c.fillRect(ex2, ey2, 1.6, 1.6);
      }
      // 黒い山なみ＋稜線の炎
      c.fillStyle = '#1c0703';
      c.beginPath(); c.moveTo(0, 180);
      c.quadraticCurveTo(80, 155, 160, 172); c.quadraticCurveTo(260, 150, 360, 168);
      c.quadraticCurveTo(440, 155, W, 175); c.lineTo(W, 200); c.lineTo(0, 200); c.closePath(); c.fill();
      for (var fi = 0; fi < 15; fi++) {
        var fx = fi * 35 + ((fi * 53) % 19);
        var fy = 168 + ((fi * 29) % 12);
        var fh = 9 + Math.abs(Math.sin(tick * 0.11 + fi * 1.7)) * 15;
        c.fillStyle = 'rgba(255,120,30,0.55)';
        c.beginPath(); c.moveTo(fx - 6, fy); c.quadraticCurveTo(fx + (Math.sin(tick * 0.09 + fi) * 3), fy - fh, fx + 6, fy); c.closePath(); c.fill();
        c.fillStyle = 'rgba(255,220,120,0.5)';
        c.beginPath(); c.moveTo(fx - 3, fy); c.quadraticCurveTo(fx, fy - fh * 0.55, fx + 3, fy); c.closePath(); c.fill();
      }
      // 地平の照り返し
      c.globalCompositeOperation = 'lighter';
      var fglow = c.createRadialGradient(W / 2, 196, 0, W / 2, 196, 250);
      fglow.addColorStop(0, 'rgba(255,90,20,0.20)'); fglow.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = fglow; c.beginPath(); c.arc(W / 2, 196, 250, 0, Math.PI * 2); c.fill();
      c.restore();
    }
    c.save();
    var sx = shake > 0 ? (Math.random() * 2 - 1) * shake : 0;
    var sy = shake > 0 ? (Math.random() * 2 - 1) * shake : 0;
    c.translate(sx, sy);
    // Ground layers（草テクスチャがあれば下地に敷いて夜色を重ねる）
    var bgp = hdPattern(c, 'grass');
    if (bgp) {
      c.fillStyle = bgp;
      c.beginPath(); c.moveTo(0, 195); c.quadraticCurveTo(W / 2, 186, W, 193); c.lineTo(W, 250); c.lineTo(0, 250); c.closePath(); c.fill();
      c.fillStyle = 'rgba(10,22,8,0.58)';
      c.beginPath(); c.moveTo(0, 195); c.quadraticCurveTo(W / 2, 186, W, 193); c.lineTo(W, 250); c.lineTo(0, 250); c.closePath(); c.fill();
    } else {
      c.fillStyle = '#1a2810';
      c.beginPath(); c.moveTo(0, 195); c.quadraticCurveTo(W / 2, 186, W, 193); c.lineTo(W, 250); c.lineTo(0, 250); c.closePath(); c.fill();
      c.fillStyle = '#223814';
      c.beginPath(); c.moveTo(0, 202); c.quadraticCurveTo(W / 2, 194, W, 200); c.lineTo(W, 250); c.lineTo(0, 250); c.closePath(); c.fill();
    }
    c.fillStyle = 'rgba(50,80,30,0.25)';
    c.beginPath(); c.moveTo(0, 210); c.quadraticCurveTo(W / 2, 203, W, 208); c.lineTo(W, 250); c.lineTo(0, 250); c.closePath(); c.fill();
    // Stage spotlight
    c.save(); c.globalCompositeOperation = 'lighter';
    var spot = c.createRadialGradient(W / 2, 195, 0, W / 2, 195, 130);
    spot.addColorStop(0, 'rgba(255,255,255,0.04)'); spot.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = spot; c.beginPath(); c.arc(W / 2, 195, 130, 0, Math.PI * 2); c.fill();
    c.restore();
    // Enemy back-light
    c.save(); c.globalCompositeOperation = 'lighter';
    var ebl = c.createRadialGradient(W / 2, 130, 0, W / 2, 130, 60);
    ebl.addColorStop(0, 'rgba(80,40,120,0.08)'); ebl.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = ebl; c.beginPath(); c.arc(W / 2, 130, 60, 0, Math.PI * 2); c.fill();
    c.restore();
    var ex = (enemy.shake && enemy.shake > 0) ? (Math.random() * 2 - 1) * 6 : 0;
    var battleImg = (enemy.kind === 'odoriko' && ODORIKO_BATTLE_IMG) ? ODORIKO_BATTLE_IMG
                  : ((enemy.kind || 'enemy') === 'enemy' && ENEMY_BATTLE_IMG) ? ENEMY_BATTLE_IMG
                  : null;
    if (battleImg) {
      var eih = 220, eiw = eih * (battleImg.width / battleImg.height);
      var eFloat = Math.sin(tick * 0.05) * 4;
      var eix = W / 2 - eiw / 2 + ex, eiy = 25 + eFloat;
      var auraColor = enemy.kind === 'odoriko' ? ((enemy.fireT || 0) > 0.3 ? 'rgba(220,80,20,' : 'rgba(100,60,140,') : 'rgba(60,20,100,';
      var aura = c.createRadialGradient(W / 2 + ex, eiy + eih * 0.45, 0, W / 2 + ex, eiy + eih * 0.45, eih * 0.6);
      aura.addColorStop(0, auraColor + '0.25)'); aura.addColorStop(0.6, auraColor + '0.1)'); aura.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = aura; c.beginPath(); c.arc(W / 2 + ex, eiy + eih * 0.45, eih * 0.6, 0, Math.PI * 2); c.fill();
      c.drawImage(battleImg, eix, eiy, eiw, eih);
    } else {
      drawActor(c, W / 2 + ex, 150, enemy.kind || 'enemy', 'down', 2.4);
    }
    c.restore();
    // Ground fog
    drawFogBand(c, 190, 50, 'rgba(160,180,200,0.04)');
    drawVignette(c);
    if (popups) {
      c.textAlign = 'center';
      for (let i = 0; i < popups.length; i++) {
        const p = popups[i];
        c.globalAlpha = Math.max(0, Math.min(1, p.life));
        c.fillStyle = p.color; c.font = 'bold 26px "Hiragino Sans",sans-serif';
        c.fillText(p.text, p.x, p.y);
      }
      c.globalAlpha = 1;
    }
    c.textAlign = 'center';
    c.fillStyle = '#f1f3f5'; c.font = 'bold 18px "Hiragino Sans",sans-serif';
    c.fillText(enemy.name, W / 2, 208);
    if (!enemy.forcelose && !enemy.hideHp) drawHPBar(c, W / 2 - 80, 216, 160, enemy.hp, enemy.maxhp, '#e8590c');
    c.textAlign = 'left';
    if (player.atkDownT > 0) {
      // 敵HPバー（中央）と重ならないよう右寄せ・短縮表記
      c.textAlign = 'right';
      c.fillStyle = '#ff8787'; c.font = 'bold 11px "Hiragino Sans",sans-serif';
      c.fillText('▼攻ダウン あと' + player.atkDownT + 'ターン', W - 22, allies.length === 1 ? 282 : (allies.length >= 4 ? 224 : 236));
      c.textAlign = 'left';
    }
    if (allies.length === 1) {
      // 1人（従来レイアウト）
      c.fillStyle = '#cdd9ff'; c.font = '15px "Hiragino Sans",sans-serif';
      c.fillText('オダ　Lv' + player.lv + '　HP ' + player.hp + '/' + player.maxhp, 22, 296);
      drawHPBar(c, 22, 304, 170, player.hp, player.maxhp, '#37b24d');
    } else {
      // パーティ: 左下に縦積み（人数に応じて詰める・最大4人）
      const slotH = allies.length >= 4 ? 25 : 28;
      const slotY0 = allies.length >= 4 ? 228 : 240;
      for (let ai = 0; ai < allies.length; ai++) {
        const a = allies[ai];
        const ay = slotY0 + ai * slotH;
        const isTurn = (mode === 'menu' && ai === turnIdx);
        c.fillStyle = a.hp <= 0 ? '#6b7280' : (isTurn ? '#ffd43b' : '#cdd9ff');
        c.font = (isTurn ? 'bold ' : '') + '13px "Hiragino Sans",sans-serif';
        const lvTxt = a.isOda ? ' Lv' + a.lv : '';
        c.fillText((isTurn ? '▶' : '　') + a.name + lvTxt + '　' + a.hp + '/' + a.maxhp, 22, ay + 10);
        drawHPBar(c, 22, ay + 13, allies.length >= 4 ? 132 : 150, a.hp, a.maxhp, a.hp <= 0 ? '#495057' : '#37b24d');
      }
    }
    if (mode === 'menu') {
      const actorName = allies[turnIdx] ? allies[turnIdx].name : 'オダ';
      drawTextbox(c, '', allies.length === 1 ? 'どうする？' : actorName + 'は どうする？', false, true);
      const cx = W - 196, cy = 286, cw = 184, chh = 24 + commands.length * 30;
      c.fillStyle = 'rgba(8,16,40,0.97)'; roundRect(c, cx, cy, cw, chh, 10); c.fill();
      c.strokeStyle = '#cdd9ff'; c.lineWidth = 2; roundRect(c, cx + 2, cy + 2, cw - 4, chh - 4, 8); c.stroke(); c.lineWidth = 1;
      c.font = '19px "Hiragino Sans",sans-serif';
      for (let i = 0; i < commands.length; i++) {
        c.fillStyle = i === cursor ? '#ffd43b' : '#f1f3f5';
        let label = commands[i];
        if (commands[i] === 'みやぶる') label += ' Lv' + player.miyaLv;
        c.fillText((i === cursor ? '▶ ' : '　 ') + label, cx + 16, cy + 32 + i * 30);
      }
    } else {
      drawTextbox(c, '', msg, mode === 'msg' || mode === 'end', true);
    }
    if (flash > 0) { c.fillStyle = 'rgba(255,255,255,' + Math.min(0.6, flash) + ')'; c.fillRect(0, 0, W, H); }
  }

  // ===================== ミニゲームA: いずみのかみかねさだ（早口言葉） =====================
  // オダ（プレイヤー）が挑戦。ゲージのマーカーが金色ゾーンにある時にZで一音ずつ言う。
  // 失敗するとオダが噛む（イージー: 何度でも同じ音から / ハード: 3ミスで最初から）
  // ===================== ゲームオーバー（ハード: ミニゲーム失敗） =====================
  // ハードモードでは全ミニゲームが「失敗＝ゲームオーバー→タイトルへ」。
  // 本編必須のミニゲームは直前にオートセーブ済みなので「つづきから」でやり直せる。
  function makeGameOver(reason) {
    let t = 0;
    return {
      enter: function () {},
      update: function (dt) {
        t += dt;
        if (t > 0.9 && (Input.pressed('confirm') || Input.pressed('cancel'))) setScene(makeTitle(true));
      },
      render: function (c) {
        c.fillStyle = '#000000'; c.fillRect(0, 0, W, H);
        var a = Math.min(1, t / 0.8);
        c.textAlign = 'center';
        c.fillStyle = 'rgba(214,69,55,' + a + ')'; c.font = 'bold 42px "Hiragino Mincho ProN",serif';
        c.fillText('ゲームオーバー', W / 2, 180);
        c.fillStyle = 'rgba(206,212,222,' + a + ')'; c.font = '15px "Hiragino Sans",sans-serif';
        var lines = wrapText(c, reason, W - 120);
        var y = 232;
        for (var i = 0; i < lines.length; i++) { c.fillText(lines[i], W / 2, y); y += 24; }
        c.fillStyle = 'rgba(150,158,170,' + a + ')'; c.font = '12px "Hiragino Sans",sans-serif';
        c.fillText('【ハード】ミニゲームに 失敗すると ゲームオーバー。セーブから やり直そう。', W / 2, y + 22);
        if (t > 0.9 && tick % 56 < 34) {
          c.fillStyle = '#cdd9ff'; c.font = '14px "Hiragino Sans",sans-serif';
          c.fillText('Z / タップで タイトルへ', W / 2, H - 56);
        }
        c.textAlign = 'left';
      },
    };
  }

  function makeHayakuchiGame(onDone) {
    const KANA = ['い', 'ず', 'み', 'の', 'か', 'み', 'か', 'ね', 'さ', 'だ'];
    const hard = difficulty === 'hard';
    const zoneW = hard ? 0.13 : 0.24;   // 金色ゾーンの幅（0..1）
    const spd = hard ? 0.085 : 0.055;   // マーカーの速さ
    const LIMIT = 20;                    // ハード: 制限時間（秒）
    let idx = 0, misses = 0, t = 0, msg = '', msgT = 0, doneT = 0, phase = 'play';
    let timeLeft = LIMIT;
    return {
      enter: function () {},
      update: function (dt) {
        t += dt; if (msgT > 0) msgT -= dt;
        if (phase === 'clear') {
          doneT += dt;
          if (doneT > 1.2 || Input.pressed('confirm')) onDone();
          return;
        }
        if (hard) {
          timeLeft -= dt;
          if (timeLeft <= 0) { setScene(makeGameOver('時間切れ…！ 「いずみのかみかねさだ」を 言い切れなかった。')); return; }
        }
        if (Input.pressed('confirm')) {
          const pos = (Math.sin(tick * spd) + 1) / 2;
          if (Math.abs(pos - 0.5) <= zoneW / 2) {
            idx++;
            emitP(W / 2, 200, (Math.random() - 0.5) * 40, -30, 0.8, '#ffd43b', 3, 40);
            if (idx >= KANA.length) { phase = 'clear'; doneT = 0; }
          } else {
            misses++;
            msg = 'オダ「いずみの、かみかか、かね、さだ…」　いけ「ふざけて おるのか！！」';
            msgT = 1.6;
            if (hard && misses >= 3) { idx = 0; misses = 0; msg = 'いけ「最初から じゃ！」'; msgT = 1.6; }
          }
        }
      },
      render: function (c) {
        var g = c.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, '#0d0a1c'); g.addColorStop(1, '#1a1030');
        c.fillStyle = g; c.fillRect(0, 0, W, H);
        c.textAlign = 'center';
        c.fillStyle = '#ffd43b'; c.font = 'bold 22px "Hiragino Mincho ProN",serif';
        c.fillText('『い・ず・み・の・か・み・か・ね・さ・だ』', W / 2, 66);
        c.fillStyle = '#adb5bd'; c.font = '13px "Hiragino Sans",sans-serif';
        c.fillText('マーカーが 金色ゾーンに 入った瞬間に Z / タップ！　一音ずつ 言い切ろう', W / 2, 94);
        if (hard) {
          c.fillStyle = '#ff8787'; c.font = 'bold 13px "Hiragino Sans",sans-serif';
          c.fillText('【ハード】制限時間 ' + LIMIT + '秒！ 時間切れで ゲームオーバー', W / 2, 116);
        }
        // かな表示
        var kw = 40, kx0 = W / 2 - (KANA.length * kw) / 2 + kw / 2;
        for (let i = 0; i < KANA.length; i++) {
          const cur = i === idx, done = i < idx;
          c.fillStyle = done ? '#ffd43b' : (cur ? '#ffffff' : '#4a5568');
          c.font = (cur ? 'bold 34px' : '26px') + ' "Hiragino Sans",sans-serif';
          var ky = 170 + (cur ? Math.sin(tick * 0.12) * 3 : 0);
          c.fillText(KANA[i], kx0 + i * kw, ky);
          if (done) { c.fillStyle = 'rgba(255,212,59,0.5)'; c.fillText('・', kx0 + i * kw, 196); }
        }
        // タイミングゲージ
        const bx = 76, bw = W - 152, by = 250, bh = 26;
        c.fillStyle = 'rgba(0,0,0,0.5)'; roundRect(c, bx, by, bw, bh, 8); c.fill();
        const zx = bx + bw * (0.5 - zoneW / 2), zw = bw * zoneW;
        c.fillStyle = 'rgba(255,212,59,0.35)'; roundRect(c, zx, by + 2, zw, bh - 4, 6); c.fill();
        c.strokeStyle = '#ffd43b'; c.lineWidth = 1.5; roundRect(c, zx, by + 2, zw, bh - 4, 6); c.stroke(); c.lineWidth = 1;
        const pos = (Math.sin(tick * spd) + 1) / 2;
        const mx = bx + bw * pos;
        c.fillStyle = '#ffffff'; c.fillRect(mx - 2.5, by - 5, 5, bh + 10);
        c.strokeStyle = 'rgba(200,220,255,0.4)'; roundRect(c, bx, by, bw, bh, 8); c.stroke();
        // 進捗・メッセージ
        c.fillStyle = '#cdd9ff'; c.font = '14px "Hiragino Sans",sans-serif';
        c.fillText((idx) + ' / ' + KANA.length + (hard ? '　　ミス ' + misses + '/3　　のこり ' + Math.max(0, Math.ceil(timeLeft)) + '秒' : ''), W / 2, 306);
        if (msgT > 0) {
          c.fillStyle = 'rgba(255,140,140,' + Math.min(1, msgT) + ')'; c.font = 'bold 15px "Hiragino Sans",sans-serif';
          c.fillText(msg, W / 2, 340);
        }
        if (phase === 'clear') {
          c.fillStyle = '#ffd43b'; c.font = 'bold 34px "Hiragino Mincho ProN",serif';
          c.fillText('言えた！！', W / 2, 380);
        }
        drawVignette(c);
        c.textAlign = 'left';
      },
    };
  }

  // ===================== ミニゲームB: 待てー！！（追いかけっこ） =====================
  // 走り出したいけを連打で追いかける。追いつけば「待てー！！」（太鼓の差し込み口あり）
  function makeChaseGame(onDone) {
    const hard = difficulty === 'hard';
    let odaX = 60, ikeX = 250;
    const ikeV = hard ? 40 : 28;    // いけの逃げ足
    const dashPow = 13;             // 連打1回で進む距離
    let phase = 'run', doneT = 0, failMsgT = 0;
    return {
      enter: function () {},
      update: function (dt) {
        updateParts(dt);
        if (failMsgT > 0) failMsgT -= dt;
        if (phase === 'catch') {
          doneT += dt;
          if (doneT > 1.4 || Input.pressed('confirm')) onDone();
          return;
        }
        ikeX += ikeV * dt;
        odaX += 10 * dt;
        if (Input.pressed('confirm')) {
          odaX += dashPow;
          emitP(odaX - 10, 300, -40 - Math.random() * 30, -10 - Math.random() * 20, 0.5, 'rgba(220,210,190,0.8)', 2.5, 60);
        }
        if (odaX + 26 >= ikeX) { phase = 'catch'; doneT = 0; }
        if (ikeX > W - 30) { // 逃げられた → イージーは仕切り直し / ハードはゲームオーバー
          if (hard) { setScene(makeGameOver('いけに 逃げられて しまった…。夜の 街に 見失った。')); return; }
          ikeX = 250; odaX = 60; failMsgT = 1.6;
        }
      },
      render: function (c) {
        var g = c.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, '#141a30'); g.addColorStop(0.6, '#1c2348'); g.addColorStop(1, '#101625');
        c.fillStyle = g; c.fillRect(0, 0, W, H);
        // 芝生の帯
        c.fillStyle = '#2a4a22'; c.fillRect(0, 280, W, 90);
        c.fillStyle = '#213a1b'; c.fillRect(0, 330, W, 40);
        for (var gi = 0; gi < 26; gi++) {
          var gx = ((gi * 97 + tick * 2) % (W + 40)) - 20;
          c.strokeStyle = 'rgba(60,110,45,0.6)'; c.lineWidth = 1;
          c.beginPath(); c.moveTo(gx, 320); c.lineTo(gx - 3, 310); c.stroke();
        }
        c.textAlign = 'center';
        c.fillStyle = '#ffd43b'; c.font = 'bold 24px "Hiragino Mincho ProN",serif';
        c.fillText('追いかけろ！！', W / 2, 70);
        c.fillStyle = '#adb5bd'; c.font = '13px "Hiragino Sans",sans-serif';
        c.fillText('Z / タップ 連打で ダッシュ！　いけを 逃がすな！', W / 2, 96);
        if (hard) {
          c.fillStyle = '#ff8787'; c.font = 'bold 13px "Hiragino Sans",sans-serif';
          c.fillText('【ハード】逃げられたら ゲームオーバー！', W / 2, 118);
        }
        // 二人（横向き走り）
        drawActor(c, ikeX, 300, 'ike', 'right', 1.3, true);
        drawActor(c, odaX, 302, 'oda', 'right', 1.3, true);
        drawParts(c);
        if (failMsgT > 0) {
          c.fillStyle = 'rgba(255,140,140,' + Math.min(1, failMsgT) + ')'; c.font = 'bold 16px "Hiragino Sans",sans-serif';
          c.fillText('いけ「でも 17時で しまってます、の 顔である」　……仕切り直し！', W / 2, 150);
        }
        if (phase === 'catch') {
          // 太鼓の差し込み口: ここで太鼓SEが鳴る（ASSETS.md 差し替えポイント）
          var ca = Math.min(1, doneT * 3);
          c.fillStyle = 'rgba(255,255,255,' + Math.max(0, 0.5 - doneT) + ')'; c.fillRect(0, 0, W, H);
          c.fillStyle = 'rgba(255,212,59,' + ca + ')'; c.font = 'bold 44px "Hiragino Mincho ProN",serif';
          c.fillText('待てーーー！！', W / 2, 210);
        }
        drawVignette(c);
        c.textAlign = 'left';
      },
    };
  }

  // ===================== 四章: 戦トーク（陣幕・語り部モード） =====================
  // オダの解説（原作フル）を陣幕背景で読み進め、区切りごとに「合いの手クイズ」。
  // 正解すると士気ゲージが上がる（演出。失敗しても進行する）
  function makeSenTalk(onDone) {
    let phase = 'talk';
    let seg = 0;
    let qcur = 0, answered = false, correct = false;
    let morale = 0;
    const TALKS = [DIALOGUE.ch4_talk1, DIALOGUE.ch4_talk2, DIALOGUE.ch4_talk3];
    function startSeg() { Dialog.start(TALKS[seg], function () { phase = 'quiz'; qcur = 0; answered = false; }); }
    return {
      enter: function () { startSeg(); },
      update: function (dt) {
        if (phase === 'talk') { if (Dialog.active) Dialog.update(dt); return; }
        const q = DIALOGUE.sen_quiz[seg];
        if (!answered) {
          if (Input.pressed('up')) qcur = (qcur + q.choices.length - 1) % q.choices.length;
          if (Input.pressed('down')) qcur = (qcur + 1) % q.choices.length;
          if (Input.pressed('confirm')) { answered = true; correct = (qcur === q.answer); if (correct) morale++; }
        } else if (Input.pressed('confirm')) {
          seg++;
          if (seg >= TALKS.length) { phase = 'done'; onDone(morale); return; }
          phase = 'talk'; startSeg();
        }
      },
      render: function (c) {
        // 夜空と陣幕（紅白の幕）
        var g = c.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, '#0a0d20'); g.addColorStop(1, '#141a30');
        c.fillStyle = g; c.fillRect(0, 0, W, H);
        c.fillStyle = 'rgba(255,255,255,0.4)';
        for (var si = 0; si < 30; si++) { var sx = (si * 374761 + 55) % W, sy = (si * 668265 + 91) % 90; c.fillRect(sx, sy, 1, 1); }
        // 陣幕
        var camY0 = 96, camH = 210;
        for (var st = 0; st < 12; st++) {
          c.fillStyle = st % 2 === 0 ? '#a8323c' : '#f0ead8';
          c.fillRect(st * (W / 12), camY0, W / 12 + 1, camH);
        }
        c.fillStyle = 'rgba(0,0,0,0.22)'; c.fillRect(0, camY0, W, 14);
        c.fillStyle = 'rgba(0,0,0,0.28)'; c.fillRect(0, camY0 + camH - 8, W, 8);
        // 幕の家紋風マーク
        c.fillStyle = 'rgba(255,255,255,0.85)';
        c.beginPath(); c.arc(W / 2, camY0 + camH / 2 - 10, 30, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#a8323c'; c.font = 'bold 30px "Hiragino Mincho ProN",serif'; c.textAlign = 'center';
        c.fillText('戦', W / 2, camY0 + camH / 2);
        // 地面
        c.fillStyle = '#1a2812'; c.fillRect(0, camY0 + camH, W, H - camY0 - camH);
        // 三人（立ち姿）
        drawActor(c, W / 2, camY0 + camH + 34, 'oda', 'down', 1.3);
        drawActor(c, W / 2 - 90, camY0 + camH + 26, 'michi', 'right', 1.2);
        drawActor(c, W / 2 + 90, camY0 + camH + 26, 'ike', 'left', 1.2);
        // 見出しと士気
        c.fillStyle = '#ffd43b'; c.font = 'bold 22px "Hiragino Mincho ProN",serif';
        c.fillText('戦トーク ― 小牧・長久手の戦い', W / 2, 44);
        c.fillStyle = '#cdd9ff'; c.font = '14px "Hiragino Sans",sans-serif';
        var stars = ''; for (var m = 0; m < DIALOGUE.sen_quiz.length; m++) stars += m < morale ? '★' : '☆';
        c.fillText('士気 ' + stars, W / 2, 70);
        c.textAlign = 'left';
        if (phase === 'talk') { if (Dialog.active) Dialog.render(c); }
        else if (phase === 'quiz' && DIALOGUE.sen_quiz[seg]) {
          // 合いの手クイズ
          const q = DIALOGUE.sen_quiz[seg];
          c.fillStyle = 'rgba(6,10,22,0.55)'; c.fillRect(0, 80, W, H - 80);
          c.fillStyle = 'rgba(8,16,40,0.95)'; roundRect(c, 24, 96, W - 48, 58, 10); c.fill();
          c.strokeStyle = '#cdd9ff'; c.lineWidth = 2; roundRect(c, 26, 98, W - 52, 54, 8); c.stroke(); c.lineWidth = 1;
          c.fillStyle = '#ffd43b'; c.font = 'bold 13px "Hiragino Sans",sans-serif'; c.fillText('合いの手クイズ', 38, 116);
          c.fillStyle = '#f1f3f5'; c.font = '16px "Hiragino Sans",sans-serif';
          const ql = wrapText(c, q.q, W - 76);
          let qy = 138; for (let i = 0; i < ql.length; i++) { c.fillText(ql[i], 38, qy); qy += 22; }
          let y = 172;
          for (let i = 0; i < q.choices.length; i++) {
            const sel = i === qcur, isAns = i === q.answer;
            let bg = 'rgba(255,255,255,0.06)', fgc = '#f1f3f5';
            if (answered) {
              if (isAns) { bg = 'rgba(55,178,77,0.30)'; fgc = '#b2f2bb'; }
              else if (sel) { bg = 'rgba(224,49,49,0.28)'; fgc = '#ffc9c9'; }
            } else if (sel) { bg = 'rgba(255,212,59,0.18)'; fgc = '#ffd43b'; }
            c.fillStyle = bg; roundRect(c, 40, y, W - 80, 34, 8); c.fill();
            if (sel && !answered) { c.strokeStyle = '#ffd43b'; c.lineWidth = 2; roundRect(c, 40, y, W - 80, 34, 8); c.stroke(); c.lineWidth = 1; }
            c.fillStyle = fgc; c.font = '16px "Hiragino Sans",sans-serif';
            let mark = (!answered && sel) ? '▶ ' : '　 ';
            if (answered && isAns) mark = '○ ';
            else if (answered && sel && !isAns) mark = '× ';
            c.fillText(mark + q.choices[i], 56, y + 23);
            y += 42;
          }
          if (answered) {
            c.fillStyle = correct ? '#b2f2bb' : '#ffc9c9'; c.font = 'bold 17px "Hiragino Sans",sans-serif';
            c.textAlign = 'center'; c.fillText(correct ? '正解！ 士気が あがった！' : '残念…！', W / 2, y + 16); c.textAlign = 'left';
            c.fillStyle = 'rgba(8,16,40,0.94)'; roundRect(c, 24, y + 26, W - 48, 84, 10); c.fill();
            c.strokeStyle = '#cdd9ff'; c.lineWidth = 2; roundRect(c, 26, y + 28, W - 52, 80, 8); c.stroke(); c.lineWidth = 1;
            c.fillStyle = '#e9ecef'; c.font = '14px "Hiragino Sans",sans-serif';
            const nl = wrapText(c, q.note, W - 76);
            let ny = y + 50; for (let i = 0; i < nl.length; i++) { c.fillText(nl[i], 38, ny); ny += 20; }
            if (tick % 56 < 34) { c.fillStyle = '#cdd9ff'; c.font = '13px "Hiragino Sans",sans-serif'; c.textAlign = 'center'; c.fillText('Z / タップで つづける ▶', W / 2, H - 14); c.textAlign = 'left'; }
          } else {
            c.fillStyle = '#868e96'; c.font = '12px "Hiragino Sans",sans-serif'; c.textAlign = 'center';
            c.fillText('↑ ↓ 選択　　Z 決定', W / 2, H - 12); c.textAlign = 'left';
          }
        }
        drawVignette(c);
      },
    };
  }

  // ===================== 六章: 落武者ステルス =====================
  // いけを連れて、見回りの灯りに見つからないように西の森（左端）まで移動する。
  // イージー: 2回まで見逃してもらえる / ハード: 見つかると即スタートに戻る
  function makeStealthGame(onDone) {
    const hard = difficulty === 'hard';
    const SX = 452, SY = 250;
    let px = SX, py = SY;
    let trail = [], warnN = 0, msgT = 0, msg = '', phase = 'play', doneT = 0, safeT = 0;
    const guards = [
      { x: 305, y: 130, dir: 1, min: 100, max: 330, spd: hard ? 85 : 62 },
      { x: 175, y: 320, dir: -1, min: 100, max: 330, spd: hard ? 100 : 74 },
    ];
    const R = hard ? 88 : 74;
    function resetPos() { px = SX; py = SY; trail = []; }
    return {
      enter: function () {},
      update: function (dt) {
        if (msgT > 0) msgT -= dt;
        if (safeT > 0) safeT -= dt;
        if (phase === 'clear') {
          doneT += dt;
          if (doneT > 1.3 || Input.pressed('confirm')) onDone();
          return;
        }
        var dx = 0, dy = 0;
        if (Input.down('left')) dx -= 1;
        if (Input.down('right')) dx += 1;
        if (Input.down('up')) dy -= 1;
        if (Input.down('down')) dy += 1;
        px = Math.max(28, Math.min(W - 28, px + dx * 115 * dt));
        py = Math.max(96, Math.min(H - 84, py + dy * 115 * dt));
        trail.push({ x: px, y: py });
        if (trail.length > 14) trail.shift();
        for (var gi = 0; gi < guards.length; gi++) {
          var gd = guards[gi];
          gd.y += gd.dir * gd.spd * dt;
          if (gd.y < gd.min) { gd.y = gd.min; gd.dir = 1; }
          if (gd.y > gd.max) { gd.y = gd.max; gd.dir = -1; }
          if (safeT <= 0 && phase === 'play') {
            var ike = trail[0] || { x: px, y: py };
            var d1 = Math.hypot(gd.x - px, gd.y - py), d2 = Math.hypot(gd.x - ike.x, gd.y - ike.y);
            if (d1 < R || d2 < R) {
              if (hard) { setScene(makeGameOver('見回りに 見つかった…！ いけを 森まで 送りとどけられなかった。')); return; }
              else {
                warnN++;
                if (warnN >= 3) { resetPos(); warnN = 0; msg = '見つかった！ ……仕切り直し！'; msgT = 1.6; }
                else { msg = 'あぶない！（あと ' + (3 - warnN) + '回 見つかると 仕切り直し）'; msgT = 1.6; }
                safeT = 1.5;
              }
            }
          }
        }
        if (px < 58) { phase = 'clear'; doneT = 0; }
      },
      render: function (c) {
        var g = c.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, '#101625'); g.addColorStop(0.4, '#15251a'); g.addColorStop(1, '#0e1a12');
        c.fillStyle = g; c.fillRect(0, 0, W, H);
        // ゴール: 左端の森
        for (var bi = 0; bi < 6; bi++) {
          c.fillStyle = '#153a15';
          c.beginPath(); c.arc(26, 110 + bi * 55, 26, 0, Math.PI * 2); c.fill();
          c.fillStyle = '#1d5c1d';
          c.beginPath(); c.arc(20, 100 + bi * 55, 20, 0, Math.PI * 2); c.fill();
        }
        // 見回りの灯り（視界）
        for (var gi2 = 0; gi2 < guards.length; gi2++) {
          var gd2 = guards[gi2];
          var lg = c.createRadialGradient(gd2.x, gd2.y, 0, gd2.x, gd2.y, R);
          lg.addColorStop(0, 'rgba(255,220,130,0.28)'); lg.addColorStop(0.75, 'rgba(255,200,90,0.10)'); lg.addColorStop(1, 'rgba(0,0,0,0)');
          c.fillStyle = lg; c.beginPath(); c.arc(gd2.x, gd2.y, R, 0, Math.PI * 2); c.fill();
          drawActor(c, gd2.x, gd2.y, 'kancho', gd2.dir > 0 ? 'down' : 'up', 1.1, true);
        }
        // いけ（後を付いてくる）と オダ
        var ike2 = trail[0] || { x: px + 26, y: py };
        drawActor(c, ike2.x, ike2.y, 'ike', 'left', 1.1, trail.length > 2);
        drawActor(c, px, py, 'oda', 'left', 1.1, true);
        c.textAlign = 'center';
        c.fillStyle = '#ffd43b'; c.font = 'bold 20px "Hiragino Mincho ProN",serif';
        c.fillText('見つからずに、西の 森まで いけを 送りとどけろ', W / 2, 40);
        c.fillStyle = '#adb5bd'; c.font = '12px "Hiragino Sans",sans-serif';
        c.fillText('十字キーで 移動　　灯りの 輪に 入らないように！', W / 2, 62);
        if (hard && msgT <= 0) {
          c.fillStyle = '#ff8787'; c.font = 'bold 13px "Hiragino Sans",sans-serif';
          c.fillText('【ハード】一度でも 見つかったら ゲームオーバー！', W / 2, 84);
        }
        if (msgT > 0) { c.fillStyle = 'rgba(255,150,140,' + Math.min(1, msgT) + ')'; c.font = 'bold 16px "Hiragino Sans",sans-serif'; c.fillText(msg, W / 2, 86); }
        if (phase === 'clear') {
          c.fillStyle = 'rgba(255,255,255,' + Math.max(0, 0.4 - doneT * 0.3) + ')'; c.fillRect(0, 0, W, H);
          c.fillStyle = '#c3e88d'; c.font = 'bold 30px "Hiragino Mincho ProN",serif';
          c.fillText('森に たどり着いた……！', W / 2, 210);
        }
        drawVignette(c);
        c.textAlign = 'left';
      },
    };
  }

  // ===================== ミニゲーム: ドラムサークル（文化の家・森のホール） =====================
  // 収束する輪が太鼓に重なった瞬間に Z。16拍中の的中数でランク。
  function makeDrumCircle(onReturn) {
    const hard = difficulty === 'hard';
    const PERIOD = hard ? 26 : 36;
    const WINDOW = hard ? 4 : 6;
    const TOTAL = 16;
    let beats = 0, hits = 0, judged = false, flashT = 0, missT = 0, phase = 'play', doneT = 0, lastPhase = 0;
    return {
      enter: function () {},
      update: function (dt) {
        if (flashT > 0) flashT -= dt;
        if (missT > 0) missT -= dt;
        if (phase === 'result') {
          doneT += dt;
          if (doneT > 1.6 || Input.pressed('confirm')) {
            var reward = mgDone.drum ? 100 : (hits >= 13 ? 400 : 250);
            mgDone.drum = true; gold += reward; saveGame();
            onReturn();
          }
          return;
        }
        var ph = tick % PERIOD;
        if (ph < lastPhase) {
          judged = false;
          beats++;
          if (beats > TOTAL) {
            if (hard && hits < 9) { setScene(makeGameOver('リズムが 合わなかった…。（的中 ' + hits + '/' + TOTAL + '・9以上で 成功）')); return; }
            phase = 'result'; doneT = 0;
          }
        }
        lastPhase = ph;
        if (Input.pressed('confirm') && !judged && beats >= 1 && phase === 'play') {
          judged = true;
          var dist = Math.min(ph, PERIOD - ph);
          if (dist <= WINDOW) { hits++; flashT = 0.25; emitP(W / 2, 240, (Math.random() - 0.5) * 80, -50, 0.6, '#ffd43b', 3, 60); }
          else missT = 0.4;
        }
        updateParts(dt);
      },
      render: function (c) {
        var g = c.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, '#241a12'); g.addColorStop(1, '#3b2a20');
        c.fillStyle = g; c.fillRect(0, 0, W, H);
        c.fillStyle = 'rgba(255,220,150,0.06)'; c.fillRect(0, 0, W, 90);
        c.textAlign = 'center';
        c.fillStyle = '#ffd43b'; c.font = 'bold 22px "Hiragino Mincho ProN",serif';
        c.fillText('ドラムサークル', W / 2, 46);
        c.fillStyle = '#d8c8a8'; c.font = '13px "Hiragino Sans",sans-serif';
        c.fillText('輪が いちばん 小さくなった 瞬間に Z / タップ！', W / 2, 72);
        if (hard) {
          c.fillStyle = '#ff8787'; c.font = 'bold 13px "Hiragino Sans",sans-serif';
          c.fillText('【ハード】的中9未満で ゲームオーバー！', W / 2, 94);
        }
        var ph = tick % PERIOD, ratio = ph / PERIOD;
        c.fillStyle = '#5a3a20'; c.beginPath(); c.arc(W / 2, 250, 70, 0, Math.PI * 2); c.fill();
        c.fillStyle = flashT > 0 ? '#ffe9b0' : '#e8d8b8';
        c.beginPath(); c.arc(W / 2, 250, 58, 0, Math.PI * 2); c.fill();
        c.strokeStyle = '#3b2a18'; c.lineWidth = 3; c.beginPath(); c.arc(W / 2, 250, 58, 0, Math.PI * 2); c.stroke(); c.lineWidth = 1;
        var ringR = 58 + (1 - ratio) * 120;
        c.strokeStyle = 'rgba(255,212,59,' + (0.35 + ratio * 0.5) + ')'; c.lineWidth = 3;
        c.beginPath(); c.arc(W / 2, 250, ringR, 0, Math.PI * 2); c.stroke(); c.lineWidth = 1;
        drawParts(c);
        if (missT > 0) { c.fillStyle = 'rgba(255,140,140,' + Math.min(1, missT * 2) + ')'; c.font = 'bold 16px "Hiragino Sans",sans-serif'; c.fillText('ズレた…！', W / 2, 356); }
        c.fillStyle = '#f5ead0'; c.font = 'bold 15px "Hiragino Sans",sans-serif';
        c.fillText('的中 ' + hits + '（全 ' + TOTAL + ' 拍）', W / 2, 396);
        if (phase === 'result') {
          c.fillStyle = 'rgba(0,0,0,0.55)'; c.fillRect(0, 0, W, H);
          var rankTxt = hits >= 13 ? 'すばらしい！' : (hits >= 9 ? 'いいリズム！' : 'また あそぼう！');
          c.fillStyle = '#ffd43b'; c.font = 'bold 28px "Hiragino Mincho ProN",serif';
          c.fillText(rankTxt + '　的中 ' + hits + '/' + TOTAL, W / 2, 220);
        }
        drawVignette(c);
        c.textAlign = 'left';
      },
    };
  }

  // ===================== ミニゲーム: 種子島射的（色金山） =====================
  // 横切る的が中央の照準線に重なった瞬間に撃つ。装填時間あり。全5的。
  function makeShateki(onReturn) {
    const hard = difficulty === 'hard';
    let target = null;
    let round = 0, hits = 0, reloadT = 0, flashT = 0, phase = 'play', doneT = 0;
    function newTarget() {
      round++;
      var fromLeft = round % 2 === 1;
      target = {
        x: fromLeft ? -20 : W + 20, y: 150 + (round * 37) % 90,
        vx: (fromLeft ? 1 : -1) * (hard ? 150 + round * 14 : 105 + round * 9),
        alive: true,
      };
    }
    return {
      enter: function () { newTarget(); },
      update: function (dt) {
        updateParts(dt);
        if (flashT > 0) flashT -= dt;
        if (reloadT > 0) reloadT -= dt;
        if (phase === 'result') {
          doneT += dt;
          if (doneT > 1.6 || Input.pressed('confirm')) {
            var reward = (mgDone.shateki ? 50 : 150) + hits * 80;
            mgDone.shateki = true; gold += reward; saveGame();
            onReturn();
          }
          return;
        }
        function finish() {
          if (hard && hits < 3) { setScene(makeGameOver('命中 ' + hits + '/5…。的の 半分も 撃ち抜けなかった。')); return true; }
          phase = 'result'; doneT = 0; return false;
        }
        if (target && target.alive) {
          target.x += target.vx * dt;
          if (target.x < -30 || target.x > W + 30) {
            if (round >= 5) { if (finish()) return; } else newTarget();
          }
        }
        if (Input.pressed('confirm') && reloadT <= 0 && phase === 'play') {
          reloadT = hard ? 1.1 : 0.85;
          flashT = 0.15;
          if (target && target.alive && Math.abs(target.x - W / 2) < 26) {
            target.alive = false; hits++;
            emitP(target.x, target.y, 0, -40, 0.6, '#ffd43b', 4, 80);
            if (round >= 5) { if (finish()) return; } else newTarget();
          }
        }
      },
      render: function (c) {
        var g = c.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, '#101b2a'); g.addColorStop(0.6, '#1c2f1c'); g.addColorStop(1, '#12210f');
        c.fillStyle = g; c.fillRect(0, 0, W, H);
        c.textAlign = 'center';
        c.fillStyle = '#ffd43b'; c.font = 'bold 22px "Hiragino Mincho ProN",serif';
        c.fillText('種子島 射的', W / 2, 44);
        c.fillStyle = '#adb5bd'; c.font = '13px "Hiragino Sans",sans-serif';
        c.fillText('的が 中央の 線に 重なった 瞬間に Z！（装填時間に 注意）', W / 2, 70);
        if (hard) {
          c.fillStyle = '#ff8787'; c.font = 'bold 13px "Hiragino Sans",sans-serif';
          c.fillText('【ハード】命中3未満で ゲームオーバー！', W / 2, 92);
        }
        c.strokeStyle = 'rgba(255,212,59,0.5)'; c.lineWidth = 2;
        c.beginPath(); c.moveTo(W / 2, 100); c.lineTo(W / 2, 300); c.stroke(); c.lineWidth = 1;
        if (target && target.alive) {
          c.fillStyle = '#f0ead8'; c.beginPath(); c.arc(target.x, target.y, 16, 0, Math.PI * 2); c.fill();
          c.fillStyle = '#c0392b'; c.beginPath(); c.arc(target.x, target.y, 10, 0, Math.PI * 2); c.fill();
          c.fillStyle = '#f0ead8'; c.beginPath(); c.arc(target.x, target.y, 4, 0, Math.PI * 2); c.fill();
        }
        c.fillStyle = '#4a2c12'; c.fillRect(W / 2 - 5, 320, 10, 70);
        c.fillStyle = '#2a180a'; c.fillRect(W / 2 - 3, 316, 6, 14);
        if (flashT > 0) {
          c.fillStyle = 'rgba(255,230,140,0.9)';
          c.beginPath(); c.arc(W / 2, 312, 10 * flashT / 0.15, 0, Math.PI * 2); c.fill();
        }
        drawParts(c);
        c.fillStyle = reloadT > 0 ? '#ff8787' : '#c3e88d'; c.font = 'bold 14px "Hiragino Sans",sans-serif';
        c.fillText(reloadT > 0 ? '装填中……' : '発射 OK！', W / 2, 352);
        c.fillStyle = '#cdd9ff'; c.font = '14px "Hiragino Sans",sans-serif';
        c.fillText('命中 ' + hits + '　　的 ' + Math.min(round, 5) + ' / 5', W / 2, 398);
        if (phase === 'result') {
          c.fillStyle = 'rgba(0,0,0,0.55)'; c.fillRect(0, 0, W, H);
          c.fillStyle = '#ffd43b'; c.font = 'bold 28px "Hiragino Mincho ProN",serif';
          c.fillText((hits >= 5 ? '全的中！ ズドーン！！' : hits >= 3 ? 'なかなかの 腕前！' : '数うちゃ 当たる…！') + '　' + hits + '/5', W / 2, 220);
        }
        drawVignette(c);
        c.textAlign = 'left';
      },
    };
  }

  // ===================== ミニゲーム: 本を読みながら謎解き（中央図書館） =====================
  // 3冊の資料を読んでヒントを集め、答えの文字を順に選ぶ（エピローグの閏月と連動）
  function makeLibPuzzle(onReturn) {
    const BOOKS = [
      { title: '『信長と 暦』', body: '織田信長は 暦（こよみ）に 大層 きびしかった。月と 季節の ズレを 直す 仕組みを、朝廷と 争ってでも 正そうとした という。' },
      { title: '『旧暦の しくみ』', body: '昔の 暦は 月の 満ち欠けが 基準。1年が 約354日しか ないため、季節と 少しずつ ズレていく。そこで 数年に 一度、「1か月」を まるごと 足した。' },
      { title: '『長久手の 四月九日』', body: '天正12年の 4月9日は、今の 暦では 5月ごろに あたる。当時と 今の 日付を つなぐ 鍵は、この「足された 月」の 呼び名で ある。' },
    ];
    const ANSWER = ['う', 'る', 'う', 'づ', 'き'];
    const POOL = ['る', 'こ', 'う', 'づ', 'よ', 'き', 'み', 'ま'];
    const hard = difficulty === 'hard';
    let mode = 'books';
    let cur = 0, reading = -1, readSet = {};
    let picked = 0, missT = 0, doneT = 0, misses = 0;
    return {
      enter: function () {},
      update: function (dt) {
        if (missT > 0) missT -= dt;
        if (mode === 'result') {
          doneT += dt;
          if (doneT > 1.6 || Input.pressed('confirm')) {
            var reward = mgDone.lib ? 100 : 500;
            mgDone.lib = true; gold += reward; saveGame();
            onReturn();
          }
          return;
        }
        if (mode === 'books') {
          if (reading >= 0) { if (Input.pressed('confirm') || Input.pressed('cancel')) reading = -1; return; }
          var n = BOOKS.length + 1;
          if (Input.pressed('up')) cur = (cur + n - 1) % n;
          if (Input.pressed('down')) cur = (cur + 1) % n;
          if (Input.pressed('cancel')) { onReturn(); return; }
          if (Input.pressed('confirm')) {
            if (cur < BOOKS.length) { reading = cur; readSet[cur] = true; }
            else { mode = 'puzzle'; cur = 0; }
          }
          return;
        }
        // puzzle
        var m = POOL.length;
        if (Input.pressed('left')) cur = (cur + m - 1) % m;
        if (Input.pressed('right')) cur = (cur + 1) % m;
        if (Input.pressed('cancel')) { mode = 'books'; cur = 0; return; }
        if (Input.pressed('confirm')) {
          if (POOL[cur] === ANSWER[picked]) {
            picked++;
            if (picked >= ANSWER.length) { mode = 'result'; doneT = 0; }
          } else {
            misses++;
            if (hard && misses >= 3) { setScene(makeGameOver('謎が 解けなかった…。（おてつき 3回）')); return; }
            picked = 0; missT = 1.2;
          }
        }
      },
      render: function (c) {
        var g = c.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, '#2a2118'); g.addColorStop(1, '#3a2f22');
        c.fillStyle = g; c.fillRect(0, 0, W, H);
        c.textAlign = 'center';
        c.fillStyle = '#ffd43b'; c.font = 'bold 20px "Hiragino Mincho ProN",serif';
        c.fillText('本を 読みながら 謎解き', W / 2, 42);
        c.fillStyle = '#d8c8a8'; c.font = '13px "Hiragino Sans",sans-serif';
        c.fillText('信長も 大切にした、「季節の ズレを 直す 月」の 名前は？', W / 2, 68);
        if (mode === 'books') {
          if (reading >= 0) {
            var b = BOOKS[reading];
            c.fillStyle = '#f5efdc'; roundRect(c, 56, 96, W - 112, 250, 8); c.fill();
            c.fillStyle = '#3a2f22'; c.font = 'bold 17px "Hiragino Mincho ProN",serif';
            c.fillText(b.title, W / 2, 130);
            c.font = '15px "Hiragino Mincho ProN",serif'; c.textAlign = 'left';
            var bl = wrapText(c, b.body, W - 160);
            var by2 = 162;
            for (var i = 0; i < bl.length; i++) { c.fillText(bl[i], 84, by2); by2 += 24; }
            c.textAlign = 'center';
            c.fillStyle = '#8a7a60'; c.font = '12px "Hiragino Sans",sans-serif';
            c.fillText('Z / X で 閉じる', W / 2, 330);
          } else {
            var y = 110;
            for (var i2 = 0; i2 < BOOKS.length; i2++) {
              var sel = i2 === cur;
              c.fillStyle = sel ? 'rgba(255,212,59,0.16)' : 'rgba(255,255,255,0.06)';
              roundRect(c, 72, y, W - 144, 44, 8); c.fill();
              if (sel) { c.strokeStyle = '#ffd43b'; c.lineWidth = 2; roundRect(c, 72, y, W - 144, 44, 8); c.stroke(); c.lineWidth = 1; }
              c.fillStyle = sel ? '#ffd43b' : '#e8dcc0'; c.font = 'bold 16px "Hiragino Mincho ProN",serif';
              c.fillText((sel ? '▶ ' : '') + BOOKS[i2].title + (readSet[i2] ? '　✓読んだ' : ''), W / 2, y + 28);
              y += 54;
            }
            var selA = cur === BOOKS.length;
            c.fillStyle = selA ? '#ffd43b' : '#b8a988'; c.font = (selA ? 'bold ' : '') + '17px "Hiragino Sans",sans-serif';
            c.fillText((selA ? '▶ ' : '') + '謎に 答える', W / 2, y + 30);
            c.fillStyle = '#8a7a60'; c.font = '12px "Hiragino Sans",sans-serif';
            c.fillText('↑ ↓ 選択　Z 決定　X もどる', W / 2, H - 16);
          }
        } else if (mode === 'puzzle') {
          c.fillStyle = '#e8dcc0'; c.font = '15px "Hiragino Sans",sans-serif';
          c.fillText('答えの 文字を、順番に 選ぼう（' + ANSWER.length + '文字）', W / 2, 108);
          var pw = 40, px0 = W / 2 - (ANSWER.length * pw) / 2 + pw / 2;
          for (var a = 0; a < ANSWER.length; a++) {
            c.fillStyle = a < picked ? '#ffd43b' : 'rgba(255,255,255,0.15)';
            c.font = 'bold 30px "Hiragino Mincho ProN",serif';
            c.fillText(a < picked ? ANSWER[a] : '＿', px0 + a * pw, 168);
          }
          var gw2 = 52, gx0 = W / 2 - (POOL.length * gw2) / 2 + gw2 / 2;
          for (var p2 = 0; p2 < POOL.length; p2++) {
            var selP = p2 === cur;
            c.fillStyle = selP ? 'rgba(255,212,59,0.2)' : 'rgba(255,255,255,0.07)';
            roundRect(c, gx0 + p2 * gw2 - 21, 210, 42, 46, 8); c.fill();
            if (selP) { c.strokeStyle = '#ffd43b'; c.lineWidth = 2; roundRect(c, gx0 + p2 * gw2 - 21, 210, 42, 46, 8); c.stroke(); c.lineWidth = 1; }
            c.fillStyle = selP ? '#ffd43b' : '#e8dcc0'; c.font = 'bold 24px "Hiragino Mincho ProN",serif';
            c.fillText(POOL[p2], gx0 + p2 * gw2, 243);
          }
          if (missT > 0) { c.fillStyle = 'rgba(255,140,140,' + Math.min(1, missT) + ')'; c.font = 'bold 15px "Hiragino Sans",sans-serif'; c.fillText('ちがう みたい…。はじめから！' + (hard ? '（あと ' + (3 - misses) + '回で ゲームオーバー）' : ''), W / 2, 300); }
          if (hard) { c.fillStyle = '#ff8787'; c.font = 'bold 13px "Hiragino Sans",sans-serif'; c.fillText('【ハード】おてつき3回で ゲームオーバー！（現在 ' + misses + '/3）', W / 2, 330); }
          c.fillStyle = '#8a7a60'; c.font = '12px "Hiragino Sans",sans-serif';
          c.fillText('← → 選択　Z 決定　X 本に もどる', W / 2, H - 16);
        } else {
          c.fillStyle = 'rgba(0,0,0,0.5)'; c.fillRect(0, 0, W, H);
          c.fillStyle = '#ffd43b'; c.font = 'bold 30px "Hiragino Mincho ProN",serif';
          c.fillText('正解は「うるうづき」！', W / 2, 200);
          c.fillStyle = '#e8dcc0'; c.font = '15px "Hiragino Sans",sans-serif';
          c.fillText('閏月——季節と 暦の ズレを 直す、もうひとつの 月。', W / 2, 236);
        }
        drawVignette(c);
        c.textAlign = 'left';
      },
    };
  }

  // ===================== ミニゲーム: 長久手検定（市役所） =====================
  function makeKentei(onReturn) {
    const QUIZ = DIALOGUE.kentei_quiz;
    let idx = 0, qcur = 0, answered = false, correct = false, score = 0, phase = 'quiz', doneT = 0;
    return {
      enter: function () {},
      update: function (dt) {
        if (phase === 'result') {
          doneT += dt;
          if (doneT > 1.6 || Input.pressed('confirm')) {
            var reward = (score >= QUIZ.length && !mgDone.kentei) ? 1000 : score * 100;
            if (score >= QUIZ.length) mgDone.kentei = true;
            gold += reward; saveGame();
            onReturn();
          }
          return;
        }
        const q = QUIZ[idx];
        if (!answered) {
          if (Input.pressed('up')) qcur = (qcur + q.choices.length - 1) % q.choices.length;
          if (Input.pressed('down')) qcur = (qcur + 1) % q.choices.length;
          if (Input.pressed('confirm')) { answered = true; correct = (qcur === q.answer); if (correct) score++; }
        } else if (Input.pressed('confirm')) {
          idx++;
          if (idx >= QUIZ.length) {
            if (difficulty === 'hard' && score < 3) { setScene(makeGameOver('長久手検定、不合格…。（正解 ' + score + '/' + QUIZ.length + '・3問以上で 合格）')); return; }
            phase = 'result'; doneT = 0; return;
          }
          qcur = 0; answered = false;
        }
      },
      render: function (c) {
        var g = c.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, '#1a2433'); g.addColorStop(1, '#243447');
        c.fillStyle = g; c.fillRect(0, 0, W, H);
        c.textAlign = 'center';
        c.fillStyle = '#ffd43b'; c.font = 'bold 22px "Hiragino Mincho ProN",serif';
        c.fillText('長久手検定', W / 2, 44);
        if (phase === 'result') {
          c.fillStyle = '#ffd43b'; c.font = 'bold 30px "Hiragino Mincho ProN",serif';
          c.fillText(score + ' / ' + QUIZ.length + ' 問 正解！', W / 2, 200);
          c.fillStyle = '#cdd9ff'; c.font = '16px "Hiragino Sans",sans-serif';
          c.fillText(score >= QUIZ.length ? 'あなたは 立派な「長久手の使い」です！' : 'また 挑戦してね！', W / 2, 240);
          drawVignette(c); c.textAlign = 'left'; return;
        }
        c.fillStyle = '#8fa8c8'; c.font = '13px "Hiragino Sans",sans-serif';
        c.fillText('第 ' + (idx + 1) + ' 問 / 全 ' + QUIZ.length + ' 問　　正解 ' + score + (difficulty === 'hard' ? '　　【ハード】3問未満で ゲームオーバー' : ''), W / 2, 70);
        const q = QUIZ[idx];
        c.fillStyle = 'rgba(8,16,40,0.9)'; roundRect(c, 24, 88, W - 48, 58, 10); c.fill();
        c.strokeStyle = '#cdd9ff'; c.lineWidth = 2; roundRect(c, 26, 90, W - 52, 54, 8); c.stroke(); c.lineWidth = 1;
        c.fillStyle = '#f1f3f5'; c.font = '16px "Hiragino Sans",sans-serif'; c.textAlign = 'left';
        const ql = wrapText(c, q.q, W - 76);
        let qy = 114; for (let i = 0; i < ql.length; i++) { c.fillText(ql[i], 38, qy); qy += 22; }
        let y = 164;
        for (let i = 0; i < q.choices.length; i++) {
          const sel = i === qcur, isAns = i === q.answer;
          let bg = 'rgba(255,255,255,0.06)', fgc = '#f1f3f5';
          if (answered) {
            if (isAns) { bg = 'rgba(55,178,77,0.30)'; fgc = '#b2f2bb'; }
            else if (sel) { bg = 'rgba(224,49,49,0.28)'; fgc = '#ffc9c9'; }
          } else if (sel) { bg = 'rgba(255,212,59,0.18)'; fgc = '#ffd43b'; }
          c.fillStyle = bg; roundRect(c, 40, y, W - 80, 36, 8); c.fill();
          if (sel && !answered) { c.strokeStyle = '#ffd43b'; c.lineWidth = 2; roundRect(c, 40, y, W - 80, 36, 8); c.stroke(); c.lineWidth = 1; }
          c.fillStyle = fgc; c.font = '16px "Hiragino Sans",sans-serif';
          let mark = (!answered && sel) ? '▶ ' : '　 ';
          if (answered && isAns) mark = '○ ';
          else if (answered && sel && !isAns) mark = '× ';
          c.fillText(mark + q.choices[i], 56, y + 24);
          y += 44;
        }
        if (answered) {
          c.fillStyle = 'rgba(8,16,40,0.92)'; roundRect(c, 24, y + 6, W - 48, 78, 10); c.fill();
          c.fillStyle = '#e9ecef'; c.font = '13px "Hiragino Sans",sans-serif';
          const nl = wrapText(c, q.note, W - 76);
          let ny = y + 30; for (let i = 0; i < nl.length; i++) { c.fillText(nl[i], 38, ny); ny += 19; }
          c.textAlign = 'center';
          if (tick % 56 < 34) { c.fillStyle = '#cdd9ff'; c.font = '12px "Hiragino Sans",sans-serif'; c.fillText('Z / タップで つぎへ ▶', W / 2, H - 14); }
        } else {
          c.textAlign = 'center';
          c.fillStyle = '#868e96'; c.font = '12px "Hiragino Sans",sans-serif';
          c.fillText('↑ ↓ 選択　　Z 決定', W / 2, H - 12);
        }
        drawVignette(c);
        c.textAlign = 'left';
      },
    };
  }

  // ===================== ミニゲーム: 兵糧丸づくり（平成こども塾） =====================
  // レシピの順番を覚えて、そのとおりに材料を選ぶ。成功で兵糧丸×2を持ち帰れる。
  function makeHyorogan(onReturn) {
    const hard = difficulty === 'hard';
    const ING = ['米', '味噌', '胡麻', '蜂蜜', '山芋', '桂皮'];
    const LEN = hard ? 5 : 4;
    let recipe = [];
    (function () {
      var pool = [0, 1, 2, 3, 4, 5];
      for (var i = 0; i < LEN; i++) {
        var pi = (tick * 7 + i * 13 + i * i * 5) % pool.length;
        recipe.push(pool.splice(pi, 1)[0]);
      }
    })();
    let phase = 'memo';
    let memoT = hard ? 3.2 : 5.0;
    let cur = 0, picked = 0, missT = 0, doneT = 0, success = false, mistakes = 0;
    return {
      enter: function () {},
      update: function (dt) {
        if (missT > 0) missT -= dt;
        if (phase === 'memo') {
          memoT -= dt;
          if (memoT <= 0 || Input.pressed('confirm')) phase = 'input';
          return;
        }
        if (phase === 'result') {
          doneT += dt;
          if (doneT > 1.6 || Input.pressed('confirm')) {
            if (success) { bag.hyorogan += 2; saveGame(); }
            onReturn();
          }
          return;
        }
        var m = ING.length;
        if (Input.pressed('left')) cur = (cur + m - 1) % m;
        if (Input.pressed('right')) cur = (cur + 1) % m;
        if (Input.pressed('confirm')) {
          if (cur === recipe[picked]) {
            picked++;
            if (picked >= recipe.length) { phase = 'result'; success = true; doneT = 0; }
          } else {
            mistakes++;
            if (hard && mistakes >= 2) { setScene(makeGameOver('レシピを まちがえた…。兵糧丸は 失敗作に なってしまった。')); return; }
            picked = 0; missT = 1.2; phase = 'memo'; memoT = hard ? 2.4 : 4.0;
          }
        }
      },
      render: function (c) {
        var g = c.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, '#3b2c1a'); g.addColorStop(1, '#4d3a22');
        c.fillStyle = g; c.fillRect(0, 0, W, H);
        c.textAlign = 'center';
        c.fillStyle = '#ffd43b'; c.font = 'bold 22px "Hiragino Mincho ProN",serif';
        c.fillText('兵糧丸づくり', W / 2, 44);
        if (phase === 'memo') {
          c.fillStyle = '#e8dcc0'; c.font = '14px "Hiragino Sans",sans-serif';
          c.fillText('レシピを おぼえよう！（あと ' + Math.max(0, Math.ceil(memoT)) + ' 秒）', W / 2, 76);
          var rw = 76, rx0 = W / 2 - (recipe.length * rw) / 2 + rw / 2;
          for (var i = 0; i < recipe.length; i++) {
            c.fillStyle = 'rgba(255,235,180,0.92)'; roundRect(c, rx0 + i * rw - 32, 140, 64, 64, 10); c.fill();
            c.fillStyle = '#4d3a22'; c.font = 'bold 20px "Hiragino Mincho ProN",serif';
            c.fillText(ING[recipe[i]], rx0 + i * rw, 180);
            c.fillStyle = '#ffd43b'; c.font = 'bold 13px sans-serif';
            c.fillText('' + (i + 1), rx0 + i * rw, 130);
          }
        } else if (phase === 'input') {
          c.fillStyle = '#e8dcc0'; c.font = '14px "Hiragino Sans",sans-serif';
          c.fillText('おぼえた 順番どおりに、材料を 選ぼう！（' + picked + ' / ' + recipe.length + '）', W / 2, 76);
          var gw3 = 72, gx3 = W / 2 - (ING.length * gw3) / 2 + gw3 / 2;
          for (var p3 = 0; p3 < ING.length; p3++) {
            var selI = p3 === cur;
            c.fillStyle = selI ? 'rgba(255,212,59,0.22)' : 'rgba(255,255,255,0.08)';
            roundRect(c, gx3 + p3 * gw3 - 30, 170, 60, 60, 10); c.fill();
            if (selI) { c.strokeStyle = '#ffd43b'; c.lineWidth = 2; roundRect(c, gx3 + p3 * gw3 - 30, 170, 60, 60, 10); c.stroke(); c.lineWidth = 1; }
            c.fillStyle = selI ? '#ffd43b' : '#e8dcc0'; c.font = 'bold 19px "Hiragino Mincho ProN",serif';
            c.fillText(ING[p3], gx3 + p3 * gw3, 208);
          }
          if (missT > 0) { c.fillStyle = 'rgba(255,140,140,' + Math.min(1, missT) + ')'; c.font = 'bold 15px "Hiragino Sans",sans-serif'; c.fillText('順番が ちがう！ もう一度 レシピを 見よう', W / 2, 280); }
          c.fillStyle = '#b8a480'; c.font = '12px "Hiragino Sans",sans-serif';
          c.fillText('← → 選択　　Z 決定' + (hard ? '　　【ハード】ミス2回で ゲームオーバー（' + mistakes + '/2）' : ''), W / 2, H - 16);
        } else {
          c.fillStyle = 'rgba(0,0,0,0.5)'; c.fillRect(0, 0, W, H);
          c.fillStyle = '#ffd43b'; c.font = 'bold 28px "Hiragino Mincho ProN",serif';
          c.fillText('兵糧丸、かんせい！ ×2 手に入れた', W / 2, 210);
        }
        drawVignette(c);
        c.textAlign = 'left';
      },
    };
  }

  // ===================== Splash (credit) =====================
  function makeSplash() {
    var timer = 0, phase = 'fadein';
    var FADEIN = 0.8, HOLD = 2.0, FADEOUT = 1.0;
    return {
      enter: function () {},
      update: function (dt) {
        timer += dt;
        if (phase === 'fadein' && timer >= FADEIN) { phase = 'hold'; timer = 0; }
        else if (phase === 'hold' && timer >= HOLD) { phase = 'fadeout'; timer = 0; }
        else if (phase === 'fadeout' && timer >= FADEOUT) { setScene(makeTitle(true)); return; }
        if (phase !== 'fadeout' && (Input.pressed('confirm') || Input.pressed('cancel'))) { phase = 'fadeout'; timer = 0; }
      },
      render: function (c) {
        c.fillStyle = '#ffffff'; c.fillRect(0, 0, W, H);
        var a = phase === 'fadein' ? Math.min(1, timer / FADEIN) : 1;
        if (LOGO_IMG) {
          c.save(); c.globalAlpha = a;
          var lw = 260, lh = lw * (LOGO_IMG.height / LOGO_IMG.width);
          c.drawImage(LOGO_IMG, (W - lw) / 2, (H - lh) / 2 - 10, lw, lh);
          c.restore();
        }
        if (phase === 'fadeout') { c.fillStyle = 'rgba(0,0,0,' + Math.min(1, timer / FADEOUT) + ')'; c.fillRect(0, 0, W, H); }
      }
    };
  }

  // ===================== Title / Ending =====================
  function makeTitle(fadeIn) {
    const opts = hasSave() ? ['はじめから', 'つづきから', '史跡めぐり'] : ['はじめから', '史跡めぐり'];
    let cur = 0;
    var titleFade = fadeIn ? 1.0 : 0;
    return {
      enter: function () {},
      update: function (dt) {
        if (titleFade > 0) titleFade = Math.max(0, titleFade - dt * 1.2);
        updateParts(dt);
        if (tick % 40 === 0) emitP(rnd(0, W), -5, 6 + Math.random() * 10, 12 + Math.random() * 8, 8, 'rgba(255,200,210,0.45)', 2 + Math.random() * 1.5, 1.5);
        if (tick % 25 === 0) emitP(rnd(30, W - 30), rnd(60, H - 60), (Math.random() - 0.5) * 3, -1 + Math.random(), 6, 'rgba(255,220,100,0.35)', 1 + Math.random(), 0);
        if (Input.pressed('up')) cur = (cur + opts.length - 1) % opts.length;
        if (Input.pressed('down')) cur = (cur + 1) % opts.length;
        if (Input.pressed('confirm')) {
          if (opts[cur] === 'つづきから') {
            if (loadGame()) startTransition(function () {
              // 章進行に応じた復帰先（legacy=旧フローのフィールド、それ以外は古戦場公園）
              setScene(makeField(chapter === 'legacy' ? 'field' : 'zoneA', null, null));
            });
          }
          else if (opts[cur] === '史跡めぐり') { if (hasSave()) loadGame(); setScene(makeSiteTour()); }
          else setScene(makeDifficultySelect());
        }
      },
      render: function (c) {
        var g = c.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, '#060d1e'); g.addColorStop(0.3, '#0f1a32'); g.addColorStop(0.6, '#1b2a4a'); g.addColorStop(1, '#0a0e1c');
        c.fillStyle = g; c.fillRect(0, 0, W, H);
        // Nebula glow
        c.save(); c.globalCompositeOperation = 'lighter';
        var nb = c.createRadialGradient(W * 0.3, 60, 0, W * 0.3, 60, 160);
        nb.addColorStop(0, 'rgba(40,30,80,0.15)'); nb.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = nb; c.beginPath(); c.arc(W * 0.3, 60, 160, 0, Math.PI * 2); c.fill();
        var nb2 = c.createRadialGradient(W * 0.75, 30, 0, W * 0.75, 30, 120);
        nb2.addColorStop(0, 'rgba(30,50,80,0.12)'); nb2.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = nb2; c.beginPath(); c.arc(W * 0.75, 30, 120, 0, Math.PI * 2); c.fill();
        c.restore();
        // Stars
        c.fillStyle = 'rgba(255,255,255,0.5)';
        for (var si = 0; si < 60; si++) {
          var stx = (si * 374761 + 211) % W, sty = (si * 668265 + 97) % (H * 0.5);
          var sts = ((si * 3 + 2) % 3) * 0.35 + 0.4;
          c.globalAlpha = 0.3 + ((si * 13 + 7) % 10) * 0.07;
          c.fillRect(stx, sty, sts, sts);
        }
        c.globalAlpha = 1;
        // Twinkling cross-shaped stars
        for (var si = 0; si < 6; si++) {
          var twf = (tick * 0.03 + si * 1.2) % 1;
          var twa = Math.sin(twf * Math.PI) * 0.5;
          if (twa > 0.05) {
            var stx2 = ((si + 40) * 374761 + 211) % W, sty2 = ((si + 40) * 668265 + 97) % (H * 0.45);
            c.fillStyle = 'rgba(200,220,255,' + twa + ')';
            c.fillRect(stx2 - 2, sty2, 5, 1); c.fillRect(stx2, sty2 - 2, 1, 5);
          }
        }
        // Distant mountain silhouette
        c.fillStyle = '#0a1225';
        c.beginPath(); c.moveTo(0, 240);
        c.quadraticCurveTo(60, 220, 130, 230); c.quadraticCurveTo(200, 215, 280, 228);
        c.quadraticCurveTo(350, 210, 420, 225); c.quadraticCurveTo(470, 218, W, 232);
        c.lineTo(W, 260); c.lineTo(0, 260); c.closePath(); c.fill();
        c.fillStyle = '#0d1830';
        c.beginPath(); c.moveTo(0, 245);
        c.quadraticCurveTo(100, 232, 200, 240); c.quadraticCurveTo(300, 228, 380, 238);
        c.quadraticCurveTo(450, 232, W, 242);
        c.lineTo(W, 260); c.lineTo(0, 260); c.closePath(); c.fill();
        // Ground
        c.fillStyle = '#111a0e';
        c.beginPath(); c.moveTo(0, 255); c.quadraticCurveTo(W / 2, 248, W, 253); c.lineTo(W, H); c.lineTo(0, H); c.closePath(); c.fill();
        c.fillStyle = '#1a2812';
        c.beginPath(); c.moveTo(0, 262); c.quadraticCurveTo(W / 2, 256, W, 260); c.lineTo(W, H); c.lineTo(0, H); c.closePath(); c.fill();
        // Ground grass blades
        for (var gi = 0; gi < 30; gi++) {
          var gx = (gi * 271 + 37) % W;
          var gy = 258 + (gi * 73 % 12);
          var gwind = Math.sin(tick * 0.025 + gi * 0.4) * 2;
          c.strokeStyle = 'rgba(50,80,30,0.5)'; c.lineWidth = 1;
          c.beginPath(); c.moveTo(gx, gy); c.quadraticCurveTo(gx + gwind, gy - 5, gx + gwind * 1.2, gy - 8 - (gi % 4)); c.stroke();
        }
        // Warm ground light around characters
        c.save(); c.globalCompositeOperation = 'lighter';
        var gl = c.createRadialGradient(W / 2, 285, 0, W / 2, 285, 100);
        gl.addColorStop(0, 'rgba(255,180,80,0.04)'); gl.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = gl; c.beginPath(); c.arc(W / 2, 285, 100, 0, Math.PI * 2); c.fill();
        c.restore();
        // Particles (behind text)
        drawParts(c);
        // Title logo
        c.textAlign = 'center';
        if (TITLE_LOGO_IMG) {
          var lh = 260, lw = lh * (TITLE_LOGO_IMG.width / TITLE_LOGO_IMG.height);
          c.drawImage(TITLE_LOGO_IMG, W / 2 - lw / 2, -10, lw, lh);
          c.fillStyle = '#8a9ab0'; c.font = '12px "Hiragino Sans",sans-serif';
          c.fillText('長久手市文化の家『合戦ズ』(作: 麻原奈未) より', W / 2, 250);
        } else {
          c.fillStyle = 'rgba(0,0,0,0.3)'; c.font = 'bold 14px "Hiragino Mincho ProN","Yu Mincho",serif';
          c.fillText('歴史空想RPG', W / 2 + 1, 73);
          var sg = c.createLinearGradient(0, 60, 0, 76);
          sg.addColorStop(0, '#ffe0a0'); sg.addColorStop(1, '#d4a040');
          c.fillStyle = sg; c.font = 'bold 14px "Hiragino Mincho ProN","Yu Mincho",serif';
          c.fillText('歴史空想RPG', W / 2, 72);
          c.save(); c.globalCompositeOperation = 'lighter';
          c.fillStyle = 'rgba(255,180,50,0.06)'; c.font = 'bold 72px "Hiragino Mincho ProN","Yu Mincho",serif';
          c.fillText('合戦ズ', W / 2, 150);
          c.restore();
          c.fillStyle = 'rgba(0,0,0,0.4)'; c.font = 'bold 60px "Hiragino Mincho ProN","Yu Mincho",serif';
          c.fillText('合戦ズ', W / 2 + 2, 148);
          var tg = c.createLinearGradient(0, 100, 0, 155);
          tg.addColorStop(0, '#ffe680'); tg.addColorStop(0.5, '#ffd43b'); tg.addColorStop(1, '#f0a030');
          c.fillStyle = tg; c.font = 'bold 60px "Hiragino Mincho ProN","Yu Mincho",serif';
          c.fillText('合戦ズ', W / 2, 146);
          c.save(); c.globalCompositeOperation = 'lighter';
          c.fillStyle = 'rgba(255,255,200,0.15)'; c.font = 'bold 60px "Hiragino Mincho ProN","Yu Mincho",serif';
          c.fillText('合戦ズ', W / 2, 144);
          c.restore();
          c.fillStyle = '#8a9ab0'; c.font = '12px "Hiragino Sans",sans-serif';
          c.fillText('長久手市文化の家『合戦ズ』(作: 麻原奈未) より', W / 2, 182);
        }
        // Characters
        drawActor(c, W / 2 - 72, 280, 'ike', 'right', 1.5);
        drawActor(c, W / 2, 290, 'oda', 'down', 1.5);
        drawActor(c, W / 2 + 72, 280, 'michi', 'left', 1.5);
        // Ground fog
        drawFogBand(c, H - 100, 80, 'rgba(140,160,180,0.03)');
        // Menu items
        for (let i = 0; i < opts.length; i++) {
          var my = 364 + i * 36;
          if (i === cur) {
            c.save(); c.globalCompositeOperation = 'lighter';
            var mg = c.createRadialGradient(W / 2, my - 6, 0, W / 2, my - 6, 80);
            mg.addColorStop(0, 'rgba(255,200,50,0.06)'); mg.addColorStop(1, 'rgba(0,0,0,0)');
            c.fillStyle = mg; c.beginPath(); c.arc(W / 2, my - 6, 80, 0, Math.PI * 2); c.fill();
            c.restore();
          }
          c.fillStyle = i === cur ? '#ffd43b' : '#8899bb';
          c.font = (i === cur ? 'bold ' : '') + '21px "Hiragino Sans",sans-serif';
          c.fillText((i === cur ? '▶ ' : '　') + opts[i], W / 2, my);
        }
        // Vignette
        drawVignette(c);
        if (titleFade > 0) { c.fillStyle = 'rgba(0,0,0,' + titleFade + ')'; c.fillRect(0, 0, W, H); }
        c.textAlign = 'left';
      },
    };
  }
  // ===================== 難易度選択（はじめから → ここ → プロローグ） =====================
  function makeDifficultySelect() {
    const opts = [
      { id: 'easy', name: 'イージー', desc: 'どなたでも 気軽に 楽しめる。\nクイズには ヒントつき。' },
      { id: 'hard', name: 'ハード',   desc: '敵は 手ごわく、クイズも 本格派。\n歯ごたえを 求める あなたに。' },
    ];
    let cur = 0;
    return {
      enter: function () {},
      update: function (dt) {
        updateParts(dt);
        if (Input.pressed('cancel')) { setScene(makeTitle()); return; }
        if (Input.pressed('up')) cur = (cur + opts.length - 1) % opts.length;
        if (Input.pressed('down')) cur = (cur + 1) % opts.length;
        if (Input.pressed('confirm')) {
          difficulty = opts[cur].id;
          // 新規開始: 章進行をリセット
          chapter = 'pro'; ch1Seen = { mound: false, shokuro: false, museum: false };
          ch2step = 0; ch3rusu = false; zoneAMood = 'dusk';
          setScene(makeField('zoneA', null, null));
        }
      },
      render: function (c) {
        var g = c.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, '#060d1e'); g.addColorStop(0.5, '#101b36'); g.addColorStop(1, '#0a0e1c');
        c.fillStyle = g; c.fillRect(0, 0, W, H);
        c.fillStyle = 'rgba(255,255,255,0.4)';
        for (var si = 0; si < 40; si++) { var sx = (si * 374761 + 311) % W, sy = (si * 668265 + 53) % (H * 0.6), ss = ((si * 5 + 1) % 3) * 0.3 + 0.4; c.fillRect(sx, sy, ss, ss); }
        c.textAlign = 'center';
        c.fillStyle = '#ffd43b'; c.font = 'bold 26px "Hiragino Mincho ProN","Yu Mincho",serif';
        c.fillText('難易度を えらぶ', W / 2, 84);
        for (let i = 0; i < opts.length; i++) {
          const oy = 140 + i * 116, sel = i === cur;
          c.fillStyle = sel ? 'rgba(255,212,59,0.14)' : 'rgba(255,255,255,0.04)';
          roundRect(c, 76, oy, W - 152, 96, 12); c.fill();
          if (sel) { c.strokeStyle = '#ffd43b'; c.lineWidth = 2; roundRect(c, 76, oy, W - 152, 96, 12); c.stroke(); c.lineWidth = 1; }
          c.fillStyle = sel ? '#ffd43b' : '#cdd9ff'; c.font = 'bold 22px "Hiragino Sans",sans-serif';
          c.fillText((sel ? '▶ ' : '') + opts[i].name, W / 2, oy + 34);
          c.fillStyle = sel ? '#e8ecf2' : '#8a97b0'; c.font = '14px "Hiragino Sans",sans-serif';
          var dls = opts[i].desc.split('\n');
          for (var d = 0; d < dls.length; d++) c.fillText(dls[d], W / 2, oy + 58 + d * 20);
        }
        c.fillStyle = '#868e96'; c.font = '12px "Hiragino Sans",sans-serif';
        c.fillText('↑ ↓ 選択　　Z 決定　　X / B もどる', W / 2, H - 16);
        drawVignette(c);
        c.textAlign = 'left';
      },
    };
  }
  function makeEnding() {
    return {
      enter: function () {},
      update: function (dt) {
        updateParts(dt);
        if (tick % 30 === 0) emitP(rnd(0, W), H + 5, (Math.random() - 0.5) * 4, -10 - Math.random() * 8, 7, 'rgba(255,220,100,0.3)', 1.5 + Math.random(), 0);
        if (tick % 50 === 0) emitP(rnd(0, W), -5, 5 + Math.random() * 8, 10 + Math.random() * 6, 9, 'rgba(255,200,210,0.35)', 2 + Math.random(), 1);
        if (Input.pressed('confirm')) setScene(makeTitle());
      },
      render: function (c) {
        var g = c.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, '#060d1e'); g.addColorStop(0.4, '#0e1830'); g.addColorStop(1, '#0a0e1c');
        c.fillStyle = g; c.fillRect(0, 0, W, H);
        c.fillStyle = 'rgba(255,255,255,0.4)';
        for (var si = 0; si < 40; si++) { var sx = (si * 374761 + 311) % W, sy = (si * 668265 + 53) % H, ss = ((si * 5 + 1) % 3) * 0.3 + 0.4; c.fillRect(sx, sy, ss, ss); }
        drawParts(c);
        c.textAlign = 'center';
        if (TITLE_LOGO_IMG) {
          var elh = 80, elw = elh * (TITLE_LOGO_IMG.width / TITLE_LOGO_IMG.height);
          c.drawImage(TITLE_LOGO_IMG, W / 2 - elw / 2, 80, elw, elh);
        } else {
          c.save(); c.globalCompositeOperation = 'lighter';
          c.fillStyle = 'rgba(255,180,50,0.05)'; c.font = 'bold 36px "Hiragino Mincho ProN",serif';
          c.fillText('― 合戦ズ ―', W / 2, 142);
          c.restore();
          c.fillStyle = 'rgba(0,0,0,0.35)'; c.font = 'bold 30px "Hiragino Mincho ProN",serif';
          c.fillText('― 合戦ズ ―', W / 2 + 1, 141);
          var tge = c.createLinearGradient(0, 115, 0, 145);
          tge.addColorStop(0, '#ffe680'); tge.addColorStop(1, '#f0a030');
          c.fillStyle = tge; c.font = 'bold 30px "Hiragino Mincho ProN",serif';
          c.fillText('― 合戦ズ ―', W / 2, 140);
        }
        c.fillStyle = '#d4d8de'; c.font = '18px "Hiragino Sans",sans-serif';
        for (var ei = 0; ei < DIALOGUE.ending.length; ei++) c.fillText(DIALOGUE.ending[ei], W / 2, 206 + ei * 30);
        var eg = c.createLinearGradient(0, 305, 0, 330);
        eg.addColorStop(0, '#ffe680'); eg.addColorStop(1, '#f0a030');
        c.fillStyle = eg; c.font = 'bold 26px "Hiragino Mincho ProN",serif'; c.fillText('― おわり ―', W / 2, 322);
        c.fillStyle = '#6a7280'; c.font = '13px "Hiragino Sans",sans-serif';
        c.fillText('長久手市文化の家『合戦ズ』(作: 麻原奈未) より', W / 2, 372);
        var ba = Math.sin(tick * 0.06) * 0.3 + 0.7;
        if (ba > 0.35) { c.fillStyle = 'rgba(180,195,220,' + (ba * 0.8) + ')'; c.font = '16px "Hiragino Sans",sans-serif'; c.fillText('Z / タップで タイトルへ', W / 2, 408); }
        drawVignette(c);
        c.textAlign = 'left';
      },
    };
  }

  // ===================== Epilogue (記念館・館長) =====================
  const EPILOGUE = DIALOGUE.epilogue;
  function makeEpilogue() {
    const map = parseMap('museum');
    const oda = { x: 7 * TILE + TILE / 2, y: 8 * TILE + TILE / 2, kind: 'oda', facing: 'up' };
    const kancho = { x: 7 * TILE + TILE / 2, y: 5 * TILE + TILE / 2, kind: 'kancho', facing: 'down' };
    return {
      enter: function () { Dialog.start(EPILOGUE, function () { startTransition(function () { setScene(makeEnding()); }); }); },
      update: function (dt) { if (Dialog.active) Dialog.update(dt); },
      render: function (c) {
        for (let r = 0; r < map.grid.length; r++) {
          for (let col = 0; col < map.grid[r].length; col++) drawTile(c, map.grid[r][col], col * TILE, r * TILE, map.tileset);
        }
        drawActor(c, kancho.x, kancho.y, kancho.kind, kancho.facing, 1);
        drawActor(c, oda.x, oda.y, oda.kind, oda.facing, 1);
        drawVignette(c);
        if (Dialog.active) Dialog.render(c);
      },
    };
  }

  // ===================== Menu (ステータス/装備/図鑑/名鑑) =====================
  const MENU_TABS = ['ステータス', 'そうび', '史跡図鑑', '武将名鑑'];
  function makeMenu(returnScene) {
    let tab = 0, cur = 0, sub = null;
    function equip(id) {
      const it = ITEMS[id]; if (!it) return;
      const slot = it.type;
      const old = Hero[slot];
      Hero[slot] = id;
      const idx = Hero.items.indexOf(id); if (idx >= 0) Hero.items.splice(idx, 1);
      if (old && old !== id) Hero.items.push(old);
    }
    return {
      enter: function () {},
      update: function () {
        if (sub) {
          const list = sub.list;
          if (Input.pressed('cancel')) { sub = null; return; }
          if (Input.pressed('up')) sub.cur = (sub.cur + list.length - 1) % list.length;
          if (Input.pressed('down')) sub.cur = (sub.cur + 1) % list.length;
          if (Input.pressed('confirm') && list.length) { equip(list[sub.cur]); sub = null; }
          return;
        }
        if (Input.pressed('cancel')) { setScene(returnScene); return; }
        if (Input.pressed('left')) { tab = (tab + MENU_TABS.length - 1) % MENU_TABS.length; cur = 0; }
        if (Input.pressed('right')) { tab = (tab + 1) % MENU_TABS.length; cur = 0; }
        if (tab === 1) {
          if (Input.pressed('up') || Input.pressed('down')) cur = (cur + 1) % 2;
          if (Input.pressed('confirm')) {
            const type = cur === 0 ? 'weapon' : 'armor';
            const list = Hero.items.filter(function (id) { return ITEMS[id] && ITEMS[id].type === type; });
            if (list.length) sub = { type: type, list: list, cur: 0 };
          }
        } else if (tab === 2) {
          const n = ZUKAN.length;
          if (Input.pressed('up')) cur = (cur + n - 1) % n;
          if (Input.pressed('down')) cur = (cur + 1) % n;
        } else if (tab === 3) {
          const n = MEIKAN.length;
          if (Input.pressed('up')) cur = (cur + n - 1) % n;
          if (Input.pressed('down')) cur = (cur + 1) % n;
        }
      },
      render: function (c) { drawMenu(c, tab, cur, sub); },
    };
  }
  function drawMenu(c, tab, cur, sub) {
    c.fillStyle = '#0a1020'; c.fillRect(0, 0, W, H);
    c.textAlign = 'left'; c.textBaseline = 'alphabetic';
    c.font = 'bold 15px "Hiragino Sans",sans-serif';
    let tx = 14;
    for (let i = 0; i < MENU_TABS.length; i++) {
      const tw = c.measureText(MENU_TABS[i]).width + 16;
      c.fillStyle = i === tab ? '#ffd43b' : '#16213f'; roundRect(c, tx, 14, tw, 28, 6); c.fill();
      c.fillStyle = i === tab ? '#0a1020' : '#cdd9ff'; c.fillText(MENU_TABS[i], tx + 8, 33);
      tx += tw + 6;
    }
    const cx = 14, cy = 56, cw = W - 28;
    c.strokeStyle = '#2b3a5a'; c.lineWidth = 1; roundRect(c, cx, cy, cw, H - cy - 34, 8); c.stroke();
    if (tab === 0) {
      c.fillStyle = '#f1f3f5'; c.font = '17px "Hiragino Sans",sans-serif';
      const atkLo = 5 + Hero.atkBonus + weaponAtk(), atkHi = 8 + Hero.atkBonus + weaponAtk();
      const lines = [
        'オダ　　レベル ' + Hero.lv,
        '最大HP　' + Hero.maxhp,
        'こうげき　' + atkLo + '〜' + atkHi,
        'まもり　　' + armorDef(),
        'みやぶる　Lv ' + miyaLvFromLv(Hero.lv),
        '経験値　　' + Hero.exp + ' / ' + expToNext(Hero.lv),
        '武器　　' + ITEMS[Hero.weapon].name,
        '防具　　' + ITEMS[Hero.armor].name,
        '難易度　　' + DIFF[difficulty].label,
        '所持金　　' + gold + ' 円',
        'どうぐ　　おにぎり×' + bag.onigiri + '　長久手茶×' + bag.cha + '　兵糧丸×' + bag.hyorogan,
      ];
      let y = cy + 32;
      for (let i = 0; i < lines.length; i++) { c.fillText(lines[i], cx + 22, y); y += 32; }
    } else if (tab === 1) {
      const slots = [['武器', Hero.weapon], ['防具', Hero.armor]];
      c.font = '17px "Hiragino Sans",sans-serif';
      let y = cy + 38;
      for (let i = 0; i < 2; i++) {
        c.fillStyle = (!sub && i === cur) ? '#ffd43b' : '#f1f3f5';
        c.fillText((!sub && i === cur ? '▶ ' : '　 ') + slots[i][0] + '：' + ITEMS[slots[i][1]].name, cx + 22, y);
        y += 38;
      }
      c.fillStyle = '#adb5bd'; c.font = '14px "Hiragino Sans",sans-serif';
      c.fillText('Zで 装備を 変更できる', cx + 22, y + 6);
      if (sub) {
        const ox = cx + 36, oy = cy + 44, ow = cw - 90, oh = 24 + sub.list.length * 30;
        c.fillStyle = 'rgba(8,16,40,0.98)'; roundRect(c, ox, oy, ow, oh, 8); c.fill();
        c.strokeStyle = '#cdd9ff'; c.lineWidth = 2; roundRect(c, ox, oy, ow, oh, 8); c.stroke(); c.lineWidth = 1;
        c.font = '16px "Hiragino Sans",sans-serif';
        for (let i = 0; i < sub.list.length; i++) {
          const it = ITEMS[sub.list[i]];
          c.fillStyle = i === sub.cur ? '#ffd43b' : '#f1f3f5';
          const stat = it.type === 'weapon' ? ('こうげき+' + it.atk) : ('まもり+' + it.def);
          c.fillText((i === sub.cur ? '▶ ' : '　 ') + it.name + '　' + stat, ox + 14, oy + 30 + i * 30);
        }
      }
    } else if (tab === 2) {
      drawCollection(c, ZUKAN, zukanSet, cur, cx, cy, cw);
    } else if (tab === 3) {
      drawCollection(c, MEIKAN, meikanSet, cur, cx, cy, cw);
    }
    c.fillStyle = '#868e96'; c.font = '12px "Hiragino Sans",sans-serif'; c.textAlign = 'center';
    c.fillText('← → タブ　↑ ↓ 選択　Z 決定　X / B 閉じる', W / 2, H - 14);
    c.textAlign = 'left';
  }
  function drawCollection(c, list, unlocked, cur, cx, cy, cw) {
    const lx = cx + 14, lw = 168;
    c.font = '14px "Hiragino Sans",sans-serif';
    let y = cy + 26;
    for (let i = 0; i < list.length; i++) {
      const got = unlocked.has(list[i].id);
      c.fillStyle = i === cur ? '#ffd43b' : (got ? '#f1f3f5' : '#555c6b');
      c.fillText((i === cur ? '▶' : '　') + (got ? list[i].name : '？？？'), lx, y);
      y += 25;
    }
    const dx = lx + lw, dw = cw - lw - 26;
    const cur0 = list[cur], got0 = unlocked.has(cur0.id);
    c.fillStyle = '#16213f'; roundRect(c, dx, cy + 14, dw, H - cy - 64, 8); c.fill();
    c.fillStyle = '#ffd43b'; c.font = 'bold 16px "Hiragino Sans",sans-serif';
    c.fillText(got0 ? cur0.name : '？？？', dx + 12, cy + 42);
    c.fillStyle = '#cdd9ff'; c.font = '14px "Hiragino Sans",sans-serif';
    const dl = wrapText(c, got0 ? cur0.desc : '（まだ 発見していない）', dw - 24);
    let dy = cy + 70;
    for (let i = 0; i < dl.length; i++) { c.fillText(dl[i], dx + 12, dy); dy += 22; }
  }

  // ===================== ショップ（イオンモール長久手） =====================
  function makeShop(onReturn) {
    const keys = Object.keys(GOODS).filter(function (k) { return GOODS[k].price > 0; });
    let cur = 0, msg = '', msgT = 0;
    const n = keys.length + 1; // 末尾「みせを でる」
    return {
      enter: function () {},
      update: function (dt) {
        if (msgT > 0) msgT -= dt;
        if (Input.pressed('cancel')) { onReturn(); return; }
        if (Input.pressed('up')) cur = (cur + n - 1) % n;
        if (Input.pressed('down')) cur = (cur + 1) % n;
        if (Input.pressed('confirm')) {
          if (cur === keys.length) { onReturn(); return; }
          const g = GOODS[keys[cur]];
          if (gold >= g.price) { gold -= g.price; bag[keys[cur]]++; saveGame(); msg = g.name + 'を 買った！'; msgT = 1.4; }
          else { msg = 'お金が 足りない…！'; msgT = 1.4; }
        }
      },
      render: function (c) {
        var g2 = c.createLinearGradient(0, 0, 0, H);
        g2.addColorStop(0, '#f4f0f5'); g2.addColorStop(1, '#e5dce8');
        c.fillStyle = g2; c.fillRect(0, 0, W, H);
        c.fillStyle = '#d9539a'; c.fillRect(0, 0, W, 56);
        c.fillStyle = '#ffffff'; c.font = 'bold 24px "Hiragino Sans",sans-serif'; c.textAlign = 'center';
        c.fillText('イオンモール長久手', W / 2, 37);
        c.fillStyle = '#5a4a55'; c.font = '13px "Hiragino Sans",sans-serif';
        c.fillText('冒険のおとも、そろってます', W / 2, 78);
        c.fillStyle = '#3a2a35'; c.font = 'bold 15px "Hiragino Sans",sans-serif';
        c.fillText('所持金　' + gold + ' 円', W / 2, 104);
        let y = 136;
        for (let i = 0; i < keys.length; i++) {
          const gd = GOODS[keys[i]], sel = i === cur;
          c.fillStyle = sel ? 'rgba(217,83,154,0.15)' : 'rgba(255,255,255,0.75)';
          roundRect(c, 48, y, W - 96, 56, 10); c.fill();
          if (sel) { c.strokeStyle = '#d9539a'; c.lineWidth = 2; roundRect(c, 48, y, W - 96, 56, 10); c.stroke(); c.lineWidth = 1; }
          c.textAlign = 'left';
          c.fillStyle = sel ? '#b03578' : '#3a2a35'; c.font = 'bold 17px "Hiragino Sans",sans-serif';
          c.fillText((sel ? '▶ ' : '　 ') + gd.name + '　' + gd.price + '円', 62, y + 24);
          c.fillStyle = '#7a6a75'; c.font = '12px "Hiragino Sans",sans-serif';
          c.fillText(gd.desc + '（所持 ' + bag[keys[i]] + '）', 78, y + 44);
          c.textAlign = 'center';
          y += 66;
        }
        const selE = cur === keys.length;
        c.fillStyle = selE ? '#b03578' : '#5a4a55'; c.font = (selE ? 'bold ' : '') + '17px "Hiragino Sans",sans-serif';
        c.fillText((selE ? '▶ ' : '') + 'みせを でる', W / 2, y + 24);
        if (msgT > 0) { c.fillStyle = 'rgba(176,53,120,' + Math.min(1, msgT) + ')'; c.font = 'bold 16px "Hiragino Sans",sans-serif'; c.fillText(msg, W / 2, H - 46); }
        c.fillStyle = '#8a7a85'; c.font = '12px "Hiragino Sans",sans-serif';
        c.fillText('↑ ↓ 選択　　Z 決定　　X / B もどる', W / 2, H - 16);
        c.textAlign = 'left';
      },
    };
  }

  // ===================== 茶室（色金山歴史公園・抹茶体験ミニゲーム） =====================
  // ← → を交互に押して茶筅をシャカシャカ。ちょうどいいリズムを保つと泡ゲージが上がる。
  // 速すぎるとお湯がこぼれ、止まると泡が消えていく。時間内にきめ細かい泡を目指す。
  function makeTeaRoom(onReturn) {
    const hard = difficulty === 'hard';
    const TIME = hard ? 20 : 25;                 // 制限時間（秒）
    const BAND_MIN = 0.09;                        // これより速い連打は「こぼれる」
    const BAND_MAX = hard ? 0.30 : 0.48;          // これより遅いとボーナスなし
    let phase = 'intro';                          // intro → play → result
    let foam = 0, timeLeft = TIME, lastDir = null, lastPress = -1, splashT = 0, msgT = 0, msg = '';
    let rank = 'C';
    let bubbles = [];                             // 泡の見た目（{a: 角度, r: 半径, s: 大きさ}）
    function addBubbles(n) {
      for (var i = 0; i < n; i++) {
        if (bubbles.length > 220) return;
        bubbles.push({ a: Math.random() * Math.PI * 2, r: Math.sqrt(Math.random()) * 78, s: 1.2 + Math.random() * 2.4 });
      }
    }
    function pressWhisk(dir) {
      if (lastDir === dir) return;                // 交互でないと数えない
      lastDir = dir;
      var now = timeLeft;
      var interval = (lastPress < 0) ? 999 : (lastPress - now);
      lastPress = now;
      if (interval < BAND_MIN) {
        foam = Math.max(0, foam - 3); splashT = 0.5;
        msg = 'はやすぎ！ お湯が こぼれた！'; msgT = 1.0;
        for (var s = 0; s < 5; s++) emitP(W / 2 + (Math.random() - 0.5) * 90, 265 + (Math.random() - 0.5) * 40, (Math.random() - 0.5) * 120, -60 - Math.random() * 60, 0.7, 'rgba(190,230,170,0.9)', 2.5, 220);
        if (bubbles.length > 8) bubbles.splice(0, 6);
      } else if (interval <= BAND_MAX) {
        foam = Math.min(100, foam + 2.4);          // ちょうどいいリズム
        addBubbles(4);
      } else {
        foam = Math.min(100, foam + 0.9);          // 遅め: 少しだけ
        addBubbles(1);
      }
    }
    return {
      enter: function () {
        Dialog.start(DIALOGUE.tea_intro, function () { phase = 'play'; lastPress = -1; });
      },
      update: function (dt) {
        updateParts(dt);
        if (splashT > 0) splashT -= dt;
        if (msgT > 0) msgT -= dt;
        if (phase === 'intro') { if (Dialog.active) Dialog.update(dt); return; }
        if (phase === 'result') { if (Dialog.active) Dialog.update(dt); return; }
        // play
        timeLeft -= dt;
        // 放置すると泡が消えていく
        if (lastPress - timeLeft > 0.9) { foam = Math.max(0, foam - 5 * dt); if (bubbles.length > 0 && tick % 20 === 0) bubbles.pop(); }
        if (Input.pressed('left')) pressWhisk('L');
        if (Input.pressed('right')) pressWhisk('R');
        if (timeLeft <= 0) {
          rank = foam >= 75 ? 'A' : (foam >= 45 ? 'B' : 'C');
          if (hard && rank === 'C') { setScene(makeGameOver('泡が 立たなかった…。（泡45以上で 成功）お点前は 一日にして ならず。')); return; }
          phase = 'result';
          if ('CBA'.indexOf(rank) > 'CBA'.indexOf(teaBest)) teaBest = rank;
          unlockZukan('chashitsu'); saveGame();
          Dialog.start(rank === 'A' ? DIALOGUE.tea_rank_a : (rank === 'B' ? DIALOGUE.tea_rank_b : DIALOGUE.tea_rank_c), function () { onReturn(rank); });
        }
      },
      render: function (c) {
        // 茶室の背景（仮素材: 板の間＋窓の外の紅葉庭園）
        var g = c.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, '#4a3220'); g.addColorStop(0.35, '#5d4128'); g.addColorStop(1, '#3a2818');
        c.fillStyle = g; c.fillRect(0, 0, W, H);
        // 窓（紅葉の庭園）
        c.fillStyle = '#2a1c10'; c.fillRect(28, 22, W - 56, 96);
        var wg = c.createLinearGradient(0, 26, 0, 112);
        wg.addColorStop(0, '#cfe3ea'); wg.addColorStop(1, '#e8d5c0');
        c.fillStyle = wg; c.fillRect(34, 28, W - 68, 84);
        for (var mi = 0; mi < 26; mi++) {
          var mx = 40 + (mi * 137 + 31) % (W - 84), my = 34 + (mi * 71 + 13) % 60;
          c.fillStyle = ['#c94f3d', '#e0703a', '#d98f2b', '#b23a2f'][mi % 4];
          c.beginPath(); c.arc(mx, my, 7 + (mi * 5) % 6, 0, Math.PI * 2); c.fill();
        }
        c.fillStyle = '#2a1c10';
        for (var wi2 = 0; wi2 < 4; wi2++) c.fillRect(34 + (wi2 + 1) * (W - 68) / 5, 28, 5, 84);
        c.fillRect(34, 66, W - 68, 4);
        // 赤い毛氈（もうせん）の台
        c.fillStyle = '#8e2f3c'; roundRect(c, 60, 180, W - 120, 190, 8); c.fill();
        c.fillStyle = 'rgba(0,0,0,0.15)'; roundRect(c, 60, 340, W - 120, 30, 8); c.fill();
        // 茶碗（俯瞰）
        var bx = W / 2, by = 265;
        c.fillStyle = 'rgba(0,0,0,0.3)'; c.beginPath(); c.ellipse(bx + 4, by + 8, 96, 88, 0, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#23272e'; c.beginPath(); c.arc(bx, by, 95, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#31363f'; c.beginPath(); c.arc(bx, by, 86, 0, Math.PI * 2); c.fill();
        // 抹茶の液面（泡が増えるほど明るく）
        var foamRatio = foam / 100;
        var teaCol = 'rgb(' + (52 + foamRatio * 60 | 0) + ',' + (110 + foamRatio * 55 | 0) + ',' + (44 + foamRatio * 45 | 0) + ')';
        c.fillStyle = teaCol; c.beginPath(); c.arc(bx, by, 80, 0, Math.PI * 2); c.fill();
        // 泡
        for (var bi2 = 0; bi2 < bubbles.length; bi2++) {
          var bb = bubbles[bi2];
          var bbx = bx + Math.cos(bb.a) * bb.r, bby = by + Math.sin(bb.a) * bb.r * 0.92;
          c.fillStyle = 'rgba(214,240,196,0.5)';
          c.beginPath(); c.arc(bbx, bby, bb.s, 0, Math.PI * 2); c.fill();
        }
        // 茶筅（左右に振れる）
        if (phase === 'play') {
          var wx = bx + (lastDir === 'L' ? -26 : lastDir === 'R' ? 26 : 0);
          c.strokeStyle = '#c9a86a'; c.lineWidth = 5;
          c.beginPath(); c.moveTo(wx, by - 130); c.lineTo(wx, by - 40); c.stroke();
          c.lineWidth = 1.6; c.strokeStyle = '#e5cf9a';
          for (var ti2 = -4; ti2 <= 4; ti2++) {
            c.beginPath(); c.moveTo(wx, by - 44); c.quadraticCurveTo(wx + ti2 * 7, by - 20, wx + ti2 * 9, by + 4); c.stroke();
          }
          c.lineWidth = 1;
        }
        drawParts(c);
        c.textAlign = 'center';
        if (phase === 'play') {
          c.fillStyle = '#ffd43b'; c.font = 'bold 20px "Hiragino Mincho ProN",serif';
          c.fillText('← → 交互に シャカシャカ！', W / 2, 152);
          c.fillStyle = '#e8dcc8'; c.font = '12px "Hiragino Sans",sans-serif';
          c.fillText('ちょうどいい リズムで。はやすぎると こぼれるよ', W / 2, 172);
          if (hard) {
            c.fillStyle = '#ff8787'; c.font = 'bold 12px "Hiragino Sans",sans-serif';
            c.fillText('【ハード】泡45未満で ゲームオーバー！', W / 2, 190);
          }
          // 泡ゲージ
          var gx2 = 76, gw2 = W - 152, gy2 = 396;
          c.fillStyle = 'rgba(0,0,0,0.5)'; roundRect(c, gx2, gy2, gw2, 20, 7); c.fill();
          var fg2 = c.createLinearGradient(gx2, 0, gx2 + gw2, 0);
          fg2.addColorStop(0, '#7fb95c'); fg2.addColorStop(1, '#c3e88d');
          c.fillStyle = fg2; roundRect(c, gx2, gy2 + 2, Math.max(4, gw2 * foamRatio), 16, 6); c.fill();
          c.strokeStyle = 'rgba(255,255,255,0.4)'; roundRect(c, gx2, gy2, gw2, 20, 7); c.stroke();
          c.fillStyle = '#f5f0e0'; c.font = 'bold 13px "Hiragino Sans",sans-serif';
          c.fillText('泡 ' + Math.round(foam) + '　　のこり ' + Math.max(0, Math.ceil(timeLeft)) + '秒', W / 2, gy2 - 8);
          if (msgT > 0) { c.fillStyle = 'rgba(255,150,140,' + Math.min(1, msgT * 2) + ')'; c.font = 'bold 16px "Hiragino Sans",sans-serif'; c.fillText(msg, W / 2, 205); }
        }
        if (splashT > 0) { c.fillStyle = 'rgba(190,230,170,' + splashT * 0.3 + ')'; c.fillRect(0, 0, W, H); }
        drawVignette(c);
        c.textAlign = 'left';
        if (Dialog.active) Dialog.render(c);
      },
    };
  }

  // ===================== 現地写真（IndexedDB・カメラ・GPS認証） =====================
  // 写真はこの端末のブラウザ内（IndexedDB）にのみ保存される。
  function idbOpen() {
    return new Promise(function (res, rej) {
      var r = indexedDB.open('kassenzu', 1);
      r.onupgradeneeded = function () { r.result.createObjectStore('photos'); };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
  }
  function idbSet(key, val) {
    return idbOpen().then(function (db) {
      return new Promise(function (res, rej) {
        var tx = db.transaction('photos', 'readwrite');
        tx.objectStore('photos').put(val, key);
        tx.oncomplete = function () { res(); };
        tx.onerror = function () { rej(tx.error); };
      });
    });
  }
  function idbGet(key) {
    return idbOpen().then(function (db) {
      return new Promise(function (res, rej) {
        var tx = db.transaction('photos', 'readonly');
        var rq = tx.objectStore('photos').get(key);
        rq.onsuccess = function () { res(rq.result); };
        rq.onerror = function () { rej(rq.error); };
      });
    });
  }
  // 実際の史跡のおおよその座標（現地認証: 半径500m）※要現地確認
  const SITE_GEO = {
    irogane: { lat: 35.1861, lng: 137.0580 },
    mihata: { lat: 35.1739, lng: 137.0532 },
    chinoike: { lat: 35.1802, lng: 137.0450 },
    musashi: { lat: 35.1757, lng: 137.0563 },
    ansho: { lat: 35.1830, lng: 137.0511 },
  };
  function geoDistM(lat1, lng1, lat2, lng2) {
    var kx = 111320 * Math.cos(lat1 * Math.PI / 180), ky = 110574;
    var dx = (lng2 - lng1) * kx, dy = (lat2 - lat1) * ky;
    return Math.sqrt(dx * dx + dy * dy);
  }
  function photoMeta() {
    try { return JSON.parse(localStorage.getItem('kassenzu_photo_meta') || '{}'); } catch (e) { return {}; }
  }
  function setPhotoMeta(id, cert) {
    try {
      var m = photoMeta(); m[id] = { cert: !!cert };
      localStorage.setItem('kassenzu_photo_meta', JSON.stringify(m));
    } catch (e) {}
  }
  // カメラ/フォトライブラリ入力（モバイルではカメラが起動する）
  var photoInput = null;
  function ensurePhotoInput() {
    if (photoInput) return photoInput;
    photoInput = document.createElement('input');
    photoInput.type = 'file';
    photoInput.accept = 'image/*';
    photoInput.setAttribute('capture', 'environment');
    photoInput.style.display = 'none';
    document.body.appendChild(photoInput);
    return photoInput;
  }
  function capturePhoto(siteId, onDone) {
    var inp = ensurePhotoInput();
    inp.onchange = function () {
      var f = inp.files && inp.files[0];
      inp.value = '';
      if (!f) { onDone(false, 'キャンセルされた'); return; }
      var fr = new FileReader();
      fr.onload = function () {
        var img = new Image();
        img.onload = function () {
          // 長辺900pxに縮小して保存（容量対策）
          var maxL = 900, sc = Math.min(1, maxL / Math.max(img.width, img.height));
          var cv = document.createElement('canvas');
          cv.width = Math.round(img.width * sc); cv.height = Math.round(img.height * sc);
          cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
          var dataUrl = cv.toDataURL('image/jpeg', 0.72);
          // GPSで現地認証（取れなくても保存はする）
          var saved = function (cert) {
            idbSet('photo_' + siteId, dataUrl).then(function () {
              setPhotoMeta(siteId, cert);
              onDone(true, cert ? '現地認証つきで 保存した！' : '保存した！（現地認証なし）');
            }).catch(function () { onDone(false, '保存に 失敗した…'); });
          };
          var geo = SITE_GEO[siteId];
          if (geo && navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(function (pos) {
              var d = geoDistM(pos.coords.latitude, pos.coords.longitude, geo.lat, geo.lng);
              saved(d <= 500);
            }, function () { saved(false); }, { timeout: 6000, maximumAge: 60000 });
          } else saved(false);
        };
        img.src = fr.result;
      };
      fr.readAsDataURL(f);
    };
    inp.click();
  }

  // ===================== 史跡カード（イラスト/現地写真・カメラ・訪問） =====================
  function makeSiteCard(site, onReturn) {
    var cur = 0, msg = '', msgT = 0;
    var photoImg = null, cert = false;
    var meta = photoMeta()[site.id];
    if (meta) cert = !!meta.cert;
    idbGet('photo_' + site.id).then(function (dataUrl) {
      if (dataUrl) { var im = new Image(); im.onload = function () { photoImg = im; }; im.src = dataUrl; }
    }).catch(function () {});
    var zk = null;
    for (var zi = 0; zi < ZUKAN.length; zi++) if (ZUKAN[zi].id === site.id) zk = ZUKAN[zi];
    var MENU = ['おとずれる（学び・クイズ・戦い）', 'カメラで さつえい', 'もどる'];
    return {
      enter: function () {},
      update: function (dt) {
        if (msgT > 0) msgT -= dt;
        if (Input.pressed('cancel')) { onReturn(); return; }
        if (Input.pressed('up')) cur = (cur + MENU.length - 1) % MENU.length;
        if (Input.pressed('down')) cur = (cur + 1) % MENU.length;
        if (Input.pressed('confirm')) {
          if (cur === 0) {
            setScene(makeSiteVisit(site, function () { startTransition(function () { setScene(makeSiteCard(site, onReturn)); }); }));
          } else if (cur === 1) {
            msg = 'カメラを 起動中…'; msgT = 2;
            capturePhoto(site.id, function (ok, m) {
              msg = m; msgT = 2.5;
              if (ok) {
                var meta2 = photoMeta()[site.id];
                cert = !!(meta2 && meta2.cert);
                idbGet('photo_' + site.id).then(function (dataUrl) {
                  if (dataUrl) { var im2 = new Image(); im2.onload = function () { photoImg = im2; }; im2.src = dataUrl; }
                });
              }
            });
          } else onReturn();
        }
      },
      render: function (c) {
        var g = c.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, '#26425e'); g.addColorStop(1, '#0c1424');
        c.fillStyle = g; c.fillRect(0, 0, W, H);
        // 画像エリア
        var ix = 46, iy = 16, iw = W - 92, ih = 196;
        c.fillStyle = '#0a1020'; roundRect(c, ix - 3, iy - 3, iw + 6, ih + 6, 10); c.fill();
        c.save();
        roundRect(c, ix, iy, iw, ih, 8); c.clip();
        if (photoImg) {
          // cover フィット
          var sc2 = Math.max(iw / photoImg.width, ih / photoImg.height);
          var dw = photoImg.width * sc2, dh = photoImg.height * sc2;
          c.drawImage(photoImg, ix + (iw - dw) / 2, iy + (ih - dh) / 2, dw, dh);
        } else {
          // 仮イラスト（差し替えポイント: 現地写真で上書きされる）
          var sg = c.createLinearGradient(0, iy, 0, iy + ih);
          sg.addColorStop(0, '#a8cbe0'); sg.addColorStop(0.55, '#cfe3d8'); sg.addColorStop(1, '#7fae6a');
          c.fillStyle = sg; c.fillRect(ix, iy, iw, ih);
          c.fillStyle = '#8fae8a'; c.beginPath(); c.moveTo(ix, iy + ih); c.lineTo(ix + iw * 0.3, iy + 60); c.lineTo(ix + iw * 0.55, iy + ih); c.closePath(); c.fill();
          c.fillStyle = '#7c9f78'; c.beginPath(); c.moveTo(ix + iw * 0.4, iy + ih); c.lineTo(ix + iw * 0.72, iy + 40); c.lineTo(ix + iw, iy + ih); c.closePath(); c.fill();
          c.fillStyle = 'rgba(20,16,10,0.7)'; roundRect(c, ix + iw / 2 - 90, iy + 20, 180, 40, 8); c.fill();
          c.textAlign = 'center';
          c.fillStyle = '#ffd43b'; c.font = 'bold 18px "Hiragino Mincho ProN",serif';
          c.fillText(site.name, ix + iw / 2, iy + 46);
          c.fillStyle = 'rgba(255,255,255,0.75)'; c.font = '11px "Hiragino Sans",sans-serif';
          c.fillText('（イラスト｜現地で 撮影すると 写真に 差し替わる）', ix + iw / 2, iy + ih - 14);
        }
        c.restore();
        c.textAlign = 'left';
        if (photoImg && cert) {
          c.fillStyle = 'rgba(47,158,68,0.92)'; roundRect(c, ix + 8, iy + 8, 96, 24, 12); c.fill();
          c.fillStyle = '#fff'; c.font = 'bold 12px "Hiragino Sans",sans-serif';
          c.fillText('✓ 現地認証', ix + 18, iy + 25);
        }
        c.textAlign = 'center';
        c.fillStyle = '#ffd43b'; c.font = 'bold 20px "Hiragino Mincho ProN",serif';
        c.fillText(site.name + '（' + site.sub + '）', W / 2, iy + ih + 32);
        if (zk) {
          c.fillStyle = '#cdd9ff'; c.font = '13px "Hiragino Sans",sans-serif'; c.textAlign = 'left';
          var dl = wrapText(c, zk.desc, W - 120);
          var dy2 = iy + ih + 54;
          for (var i3 = 0; i3 < dl.length && i3 < 3; i3++) { c.fillText(dl[i3], 60, dy2); dy2 += 19; }
          c.textAlign = 'center';
        }
        var my = 336;
        for (var mi2 = 0; mi2 < MENU.length; mi2++) {
          var sel3 = mi2 === cur;
          c.fillStyle = sel3 ? '#ffd43b' : '#9fb0cc';
          c.font = (sel3 ? 'bold ' : '') + '16px "Hiragino Sans",sans-serif';
          c.fillText((sel3 ? '▶ ' : '') + MENU[mi2], W / 2, my);
          my += 30;
        }
        if (msgT > 0) { c.fillStyle = 'rgba(195,232,141,' + Math.min(1, msgT) + ')'; c.font = 'bold 14px "Hiragino Sans",sans-serif'; c.fillText(msg, W / 2, H - 14); }
        drawVignette(c);
        c.textAlign = 'left';
      },
    };
  }

  // ===================== 史跡めぐり（サイドクエスト：学び→クイズ→戦闘） =====================
  // 長久手の実在する史跡をめぐり、小エピソードで学び、歴史クイズに答え、もののけと戦う。
  // 勝つと史跡図鑑が解放される。シティプロモーション＆学習の中心機能。
  const SITES = DIALOGUE.sites;
  function siteById(id) {
    for (var i = 0; i < SITES.length; i++) if (SITES[i].id === id) return SITES[i];
    return null;
  }

  function makeSiteTour() {
    let cur = 0;
    return {
      enter: function () {
        if (tourCleared.size >= SITES.length && !tourReward) {
          tourReward = true;
          if (Hero.items.indexOf('akazonae') < 0 && Hero.armor !== 'akazonae') Hero.items.push('akazonae');
          saveGame();
          Dialog.start(DIALOGUE.tour_complete);
        }
      },
      update: function (dt) {
        if (Dialog.active) { Dialog.update(dt); return; }
        const teaAvail = tourCleared.has('irogane'); // 色金山を踏破すると茶室が出現
        const n = SITES.length + (teaAvail ? 1 : 0) + 1; // 末尾に「もどる」
        if (Input.pressed('up')) cur = (cur + n - 1) % n;
        if (Input.pressed('down')) cur = (cur + 1) % n;
        if (Input.pressed('cancel')) { setScene(makeTitle()); return; }
        if (Input.pressed('confirm')) {
          if (cur < SITES.length) {
            var stSel = SITES[cur];
            if (!visitedSites.has(stSel.id)) {
              Dialog.start([{ name: '', text: '？？？？？——本編で 現地を 訪ねると、ここに 記録される。' }]);
              return;
            }
            setScene(makeSiteCard(stSel, function () { setScene(makeSiteTour()); }));
            return;
          }
          if (teaAvail && cur === SITES.length) {
            if (gold >= 500) { gold -= 500; setScene(makeTeaRoom(function () { setScene(makeSiteTour()); })); }
            else Dialog.start([{ name: 'オダ', text: '（抹茶体験は 500円。……いまは 持ち合わせが 足りない）' }]);
            return;
          }
          setScene(makeTitle());
        }
      },
      render: function (c) { drawSiteTour(c, cur); if (Dialog.active) Dialog.render(c); },
    };
  }
  function drawSiteTour(c, cur) {
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#26425e'); g.addColorStop(1, '#0c1424');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    c.textAlign = 'center';
    c.fillStyle = '#ffd43b'; c.font = 'bold 30px "Hiragino Mincho ProN","Yu Mincho",serif';
    c.fillText('史跡めぐり', W / 2, 56);
    c.fillStyle = '#cdd9ff'; c.font = '14px "Hiragino Sans",sans-serif';
    c.fillText('長久手の 史跡を めぐって、小牧・長久手の戦いを 学ぼう', W / 2, 82);
    c.fillStyle = '#adb5bd'; c.font = '13px "Hiragino Sans",sans-serif';
    c.fillText('踏破 ' + tourCleared.size + ' / ' + SITES.length, W / 2, 104);
    c.textAlign = 'left';
    const teaAvail = tourCleared.has('irogane');
    const rowH = teaAvail ? 41 : 46, rowBh = teaAvail ? 35 : 38;
    let y = teaAvail ? 122 : 132;
    for (let i = 0; i < SITES.length; i++) {
      const s = SITES[i], done = tourCleared.has(s.id), sel = i === cur;
      const known = visitedSites.has(s.id);
      const bx = 40, bw = W - 80, bh = rowBh;
      c.fillStyle = sel ? 'rgba(255,212,59,0.16)' : 'rgba(255,255,255,0.05)';
      roundRect(c, bx, y, bw, bh, 8); c.fill();
      if (sel) { c.strokeStyle = '#ffd43b'; c.lineWidth = 2; roundRect(c, bx, y, bw, bh, 8); c.stroke(); c.lineWidth = 1; }
      c.fillStyle = !known ? '#55607a' : (done ? '#37b24d' : (sel ? '#ffd43b' : '#cdd9ff'));
      c.font = 'bold 18px "Hiragino Sans",sans-serif';
      c.fillText((sel ? '▶ ' : '　 ') + (known ? s.name : '？？？？？'), bx + 14, y + 24);
      c.fillStyle = '#9aa7c0'; c.font = '12px "Hiragino Sans",sans-serif';
      c.fillText(known ? s.sub : '？？？', bx + bw - 120, y + 15);
      c.fillStyle = !known ? '#55607a' : (done ? '#37b24d' : '#6b7894'); c.font = '13px "Hiragino Sans",sans-serif';
      c.fillText(!known ? '未発見' : (done ? '踏破ずみ ✓' : '未踏破'), bx + bw - 120, y + 30);
      y += rowH;
    }
    if (teaAvail) {
      const selT = cur === SITES.length;
      const bx2 = 40, bw2 = W - 80;
      c.fillStyle = selT ? 'rgba(127,185,92,0.22)' : 'rgba(127,185,92,0.08)';
      roundRect(c, bx2, y, bw2, rowBh, 8); c.fill();
      if (selT) { c.strokeStyle = '#c3e88d'; c.lineWidth = 2; roundRect(c, bx2, y, bw2, rowBh, 8); c.stroke(); c.lineWidth = 1; }
      c.fillStyle = selT ? '#c3e88d' : '#8fbf74'; c.font = 'bold 18px "Hiragino Sans",sans-serif';
      c.fillText((selT ? '▶ ' : '　 ') + '色金山の茶室（抹茶体験）', bx2 + 14, y + 24);
      c.fillStyle = '#9aa7c0'; c.font = '12px "Hiragino Sans",sans-serif';
      c.fillText('ちゃしつ', bx2 + bw2 - 120, y + 15);
      c.fillStyle = teaBest ? '#c3e88d' : '#6b7894'; c.font = '13px "Hiragino Sans",sans-serif';
      c.fillText(teaBest ? 'ベスト ' + teaBest : 'あたらしい！', bx2 + bw2 - 120, y + 30);
      y += rowH;
    }
    const sel2 = cur === SITES.length + (teaAvail ? 1 : 0);
    c.fillStyle = sel2 ? '#ffd43b' : '#cdd9ff'; c.font = (sel2 ? 'bold ' : '') + '17px "Hiragino Sans",sans-serif';
    c.fillText((sel2 ? '▶ ' : '　 ') + 'タイトルへ もどる', 54, y + 22);
    c.fillStyle = '#868e96'; c.font = '12px "Hiragino Sans",sans-serif'; c.textAlign = 'center';
    c.fillText('↑ ↓ 選択　　Z 決定　　X / B もどる', W / 2, H - 14);
    c.textAlign = 'left';
  }

  function makeSiteVisit(site, onReturn) {
    // onReturn 省略時は史跡めぐり一覧へ（タイトルモード互換）
    const back = onReturn || function () { startTransition(function () { setScene(makeSiteTour()); }); };
    let phase = 'episode'; // episode → quiz → 戦闘 → 踏破
    let qcur = 0, answered = false, correct = false;
    return {
      enter: function () { Dialog.start(site.episode, function () { phase = 'quiz'; }); },
      update: function (dt) {
        if (Dialog.active) { Dialog.update(dt); return; }
        if (phase === 'episode') return;
        // quiz
        const ch = site.quiz.choices;
        if (!answered) {
          if (Input.pressed('cancel')) { back(); return; }
          if (Input.pressed('up')) qcur = (qcur + ch.length - 1) % ch.length;
          if (Input.pressed('down')) qcur = (qcur + 1) % ch.length;
          if (Input.pressed('confirm')) { answered = true; correct = (qcur === site.quiz.answer); if (correct) gold += 50; }
        } else {
          if (Input.pressed('confirm')) {
            // 学び → クイズ → もののけ戦。勝つと踏破
            Dialog.start(DIALOGUE.tour_battle_intro, function () {
              startBattle({
                gated: false,
                enemy: { name: site.enemy.name, hp: site.enemy.hp, kind: 'enemy', atkLabel: site.enemy.atkLabel, winMsg: site.enemy.winMsg },
                onWin: function () { unlockZukan(site.id); tourCleared.add(site.id); saveGame(); back(); },
                onLose: function () { back(); },
              });
            });
          }
        }
      },
      render: function (c) {
        drawSiteBg(c, site);
        if (phase === 'episode') { if (Dialog.active) Dialog.render(c); }
        else { drawQuiz(c, site, qcur, answered, correct); if (Dialog.active) Dialog.render(c); }
      },
    };
  }
  function drawSiteBg(c, site) {
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#a8cbe0'); g.addColorStop(0.55, '#cfe3d8'); g.addColorStop(1, '#7fae6a');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    // 遠景の山並み
    c.fillStyle = '#8fae8a';
    c.beginPath(); c.moveTo(0, 250); c.lineTo(120, 170); c.lineTo(260, 250); c.closePath(); c.fill();
    c.fillStyle = '#7c9f78';
    c.beginPath(); c.moveTo(180, 250); c.lineTo(330, 150); c.lineTo(470, 250); c.closePath(); c.fill();
    c.fillStyle = '#9bbf95';
    c.beginPath(); c.moveTo(360, 250); c.lineTo(470, 180); c.lineTo(512, 250); c.closePath(); c.fill();
    c.fillStyle = '#6f9a5e'; c.fillRect(0, 248, W, H - 248);
    // 史跡名の札
    c.fillStyle = 'rgba(20,16,10,0.78)'; roundRect(c, W / 2 - 130, 18, 260, 50, 10); c.fill();
    c.strokeStyle = '#ffd43b'; c.lineWidth = 2; roundRect(c, W / 2 - 130, 18, 260, 50, 10); c.stroke(); c.lineWidth = 1;
    c.textAlign = 'center';
    c.fillStyle = '#ffd43b'; c.font = 'bold 22px "Hiragino Mincho ProN",serif'; c.fillText(site.name, W / 2, 44);
    c.fillStyle = '#e9ecef'; c.font = '12px "Hiragino Sans",sans-serif'; c.fillText(site.sub, W / 2, 61);
    c.textAlign = 'left';
  }
  function drawQuiz(c, site, qcur, answered, correct) {
    const q = site.quiz;
    // 背景（空・山）が明るく文字が読みにくいので、クイズ中は暗幕を一枚かける
    c.fillStyle = 'rgba(6,10,22,0.5)'; c.fillRect(0, 78, W, H - 78);
    c.fillStyle = 'rgba(8,16,40,0.92)'; roundRect(c, 24, 92, W - 48, 60, 10); c.fill();
    c.strokeStyle = '#cdd9ff'; c.lineWidth = 2; roundRect(c, 26, 94, W - 52, 56, 8); c.stroke(); c.lineWidth = 1;
    c.fillStyle = '#ffd43b'; c.font = 'bold 13px "Hiragino Sans",sans-serif'; c.fillText('歴史クイズ', 38, 112);
    c.fillStyle = '#f1f3f5'; c.font = '16px "Hiragino Sans",sans-serif';
    const ql = wrapText(c, q.q, W - 76);
    let qy = 132; for (let i = 0; i < ql.length; i++) { c.fillText(ql[i], 38, qy); qy += 22; }
    let y = 172;
    for (let i = 0; i < q.choices.length; i++) {
      const sel = i === qcur;
      const isAns = i === q.answer;
      let bg = 'rgba(255,255,255,0.06)', fg = '#f1f3f5';
      if (answered) {
        if (isAns) { bg = 'rgba(55,178,77,0.30)'; fg = '#b2f2bb'; }
        else if (sel) { bg = 'rgba(224,49,49,0.28)'; fg = '#ffc9c9'; }
      } else if (sel) { bg = 'rgba(255,212,59,0.18)'; fg = '#ffd43b'; }
      c.fillStyle = bg; roundRect(c, 40, y, W - 80, 36, 8); c.fill();
      if (sel && !answered) { c.strokeStyle = '#ffd43b'; c.lineWidth = 2; roundRect(c, 40, y, W - 80, 36, 8); c.stroke(); c.lineWidth = 1; }
      c.fillStyle = fg; c.font = '16px "Hiragino Sans",sans-serif';
      let mark = (!answered && sel) ? '▶ ' : '　 ';
      if (answered && isAns) mark = '○ ';
      else if (answered && sel && !isAns) mark = '× ';
      c.fillText(mark + q.choices[i], 56, y + 24);
      y += 44;
    }
    if (answered) {
      c.fillStyle = correct ? '#b2f2bb' : '#ffc9c9'; c.font = 'bold 18px "Hiragino Sans",sans-serif';
      c.textAlign = 'center'; c.fillText(correct ? '正解！' : '残念…！', W / 2, y + 14); c.textAlign = 'left';
      c.fillStyle = 'rgba(8,16,40,0.92)'; roundRect(c, 24, y + 24, W - 48, 92, 10); c.fill();
      c.strokeStyle = '#cdd9ff'; c.lineWidth = 2; roundRect(c, 26, y + 26, W - 52, 88, 8); c.stroke(); c.lineWidth = 1;
      c.fillStyle = '#e9ecef'; c.font = '14px "Hiragino Sans",sans-serif';
      const nl = wrapText(c, q.note, W - 76);
      let ny = y + 48; for (let i = 0; i < nl.length; i++) { c.fillText(nl[i], 38, ny); ny += 20; }
      if (tick % 56 < 34) { c.fillStyle = '#cdd9ff'; c.font = '13px "Hiragino Sans",sans-serif'; c.textAlign = 'center'; c.fillText('Z / タップで つづける ▶', W / 2, y + 108); c.textAlign = 'left'; }
    } else {
      c.fillStyle = '#868e96'; c.font = '12px "Hiragino Sans",sans-serif'; c.textAlign = 'center';
      c.fillText('↑ ↓ 選択　　Z 決定　　X / B 一覧へ', W / 2, H - 12); c.textAlign = 'left';
    }
  }

  // ===================== Main loop =====================
  let tick = 0, last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now; tick++;
    if (!trans.active && scene && scene.update) scene.update(dt);
    updateTransition(dt);
    ctx.setTransform(RES, 0, 0, RES, 0, 0); // HD解像度スケール（論理座標にリセット）
    ctx.clearRect(0, 0, W, H);
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    if (scene && scene.render) scene.render(ctx);
    renderTransition(ctx);
    Input.clearEdges();
    requestAnimationFrame(frame);
  }
  setScene(makeSplash());
  requestAnimationFrame(frame);
})();
