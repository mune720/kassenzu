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
  const W = TILE * COLS, H = TILE * ROWS; // 512 x 448

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
  function spawnFieldParts(mapKey) {
    if (mapKey === 'museum') {
      if (tick % 12 === 0) emitP(rnd(40, W - 40), rnd(20, H - 160), 3 + Math.random() * 4, 6 + Math.random() * 4, 5, 'rgba(255,230,180,0.5)', 1 + Math.random() * 0.5, 0);
    } else {
      if (tick % 20 === 0) emitP(rnd(20, W - 20), rnd(20, H - 100), (Math.random() - 0.5) * 6, -2 + Math.random() * 2, 6, 'rgba(160,255,120,0.6)', 1.5 + Math.random(), 0);
      if (tick % 45 === 0) emitP(rnd(0, W), -5, 8 + Math.random() * 12, 15 + Math.random() * 8, 7, 'rgba(255,200,210,0.5)', 2 + Math.random(), 2);
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
    if (kind === 'enemy') { drawGhost(c, cx, cy, scale); }
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
  const SOLID = {
    museum: new Set(['#', 'B', 'K', 'S', 'D']),
    field: new Set(['T', '~', 'M', 'P']),
  };
  function parseMap(rows, key) {
    const grid = rows.map(function (r) { return r.split(''); });
    let spawn = { col: 1, row: 1 };
    const npcs = [];
    const acts = {};
    for (let row = 0; row < grid.length; row++) {
      for (let col = 0; col < grid[row].length; col++) {
        const ch = grid[row][col];
        if (ch === '@') { spawn = { col: col, row: row }; grid[row][col] = (key === 'museum') ? '.' : ','; }
        else if (ch === 'i') { npcs.push({ col: col, row: row, kind: 'ike', id: 'ike' }); grid[row][col] = '.'; }
        else if (ch === 'm') { npcs.push({ col: col, row: row, kind: 'michi', id: 'michi' }); grid[row][col] = ','; }
        else if (ch === 'B') acts[col + ',' + row] = 'byobu';
        else if (ch === 'K') acts[col + ',' + row] = 'katchu';
        else if (ch === 'S') acts[col + ',' + row] = 'katana';
        else if (ch === 'D') acts[col + ',' + row] = 'door';
        else if (ch === 'M') acts[col + ',' + row] = 'mound';
        else if (ch === 'P') acts[col + ',' + row] = 'save';
      }
    }
    return { key: key, grid: grid, spawn: spawn, npcs: npcs, acts: acts };
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
      }
    } else {
      fillSmooth(c, tc, tr, x, y, function(v) {
        var gb = 74 + v * 22 | 0, gg = 140 + v * 28 | 0;
        return 'rgb(' + gb + ',' + gg + ',' + (gb - 8) + ')';
      });
      if (ch === ',') {
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
        fillSmooth(c, tc, tr, x, y, function(v) {
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
      }
    }
  }
  function drawField(c, map, player) {
    for (let r = 0; r < map.grid.length; r++) {
      for (let col = 0; col < map.grid[r].length; col++) {
        drawTile(c, map.grid[r][col], col * TILE, r * TILE, map.key);
      }
    }
    // Light glow pass
    c.save(); c.globalCompositeOperation = 'lighter';
    for (let r = 0; r < map.grid.length; r++) {
      for (let col = 0; col < map.grid[r].length; col++) {
        if (map.grid[r][col] === 'P') {
          var px = col * TILE + TILE / 2, py = r * TILE + 10;
          var fg = c.createRadialGradient(px, py, 0, px, py, TILE * 2.8);
          fg.addColorStop(0, 'rgba(255,150,50,0.14)'); fg.addColorStop(0.5, 'rgba(255,100,30,0.05)'); fg.addColorStop(1, 'rgba(0,0,0,0)');
          c.fillStyle = fg; c.beginPath(); c.arc(px, py, TILE * 2.8, 0, Math.PI * 2); c.fill();
        }
      }
    }
    c.restore();
    // Actors
    const actors = [];
    map.npcs.forEach(function (n) { actors.push({ x: n.col * TILE + TILE / 2, y: n.row * TILE + TILE / 2, kind: n.kind, facing: 'down' }); });
    actors.push({ x: player.x, y: player.y, kind: player.kind, facing: player.facing, moving: player.moving });
    actors.sort(function (a, b) { return a.y - b.y; });
    actors.forEach(function (a) { drawActor(c, a.x, a.y, a.kind, a.facing, 1, a.moving); });
    // Atmospheric overlay
    if (map.key === 'museum') {
      c.save(); c.globalAlpha = 0.04; c.fillStyle = '#ffc070'; c.fillRect(0, 0, W, H); c.restore();
      drawLightPool(c, 4 * TILE, 1.5 * TILE, 55, 'rgba(255,220,150,1)', 0.07);
      drawLightPool(c, 8 * TILE, 1.5 * TILE, 55, 'rgba(255,220,150,1)', 0.07);
      drawLightPool(c, 12 * TILE, 1.5 * TILE, 55, 'rgba(255,220,150,1)', 0.07);
    } else {
      drawSunRays(c, 0.03);
      drawFogBand(c, H - 90, 70, 'rgba(170,195,160,0.04)');
      c.save(); c.globalAlpha = 0.03; c.fillStyle = '#ffd080'; c.fillRect(0, 0, W, H); c.restore();
    }
    drawParts(c);
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

  // 史跡図鑑・武将名鑑
  const ZUKAN = [
    { id: 'kinenkan', name: '長久手古戦場記念館', desc: '国指定史跡・長久手古戦場公園に建つ記念館。小牧・長久手の戦いを語り継ぐ。' },
    { id: 'kosenjo', name: '長久手古戦場（公園）', desc: '1584年、小牧・長久手の戦いの激戦地。今は穏やかな公園になっている。' },
    { id: 'shonyu', name: '勝入塚', desc: '池田恒興（勝入斎）の墓と伝わる塚。今も人々が花を手向ける。' },
    { id: 'irogane', name: '色金山', desc: '徳川家康が軍議を開いたと伝わる標高約198mの山。腰かけたという「床机石」が残る。' },
    { id: 'mihata', name: '御旗山', desc: '家康が金扇の馬印（大将の目印）を立て、全軍を鼓舞したと伝わる山。' },
    { id: 'chinoike', name: '血の池公園', desc: '戦の後、武士が槍や刀の血を洗い、水が赤く染まったと伝わる池の跡。' },
    { id: 'musashi', name: '武蔵塚', desc: '「鬼武蔵」と恐れられた猛将・森長可が討死した地に建つ塚。剣豪の宮本武蔵とは別人。' },
    { id: 'ansho', name: '安昌寺（首塚）', desc: '戦の後、雲山和尚が敵味方の区別なく討死した武士を葬ったと伝わる寺。首塚がある。' },
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

  // ===================== Save / Load (localStorage) =====================
  const SAVE_KEY = 'kassenzu_save_v1';
  function saveGame() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        hero: Hero, tutorialDone: tutorialDone, storyStage: storyStage,
        zukan: Array.from(zukanSet), meikan: Array.from(meikanSet),
        tour: Array.from(tourCleared), tourReward: tourReward,
      }));
      return true;
    } catch (e) { return false; }
  }
  function hasSave() { try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; } }
  function loadGame() {
    try {
      const d = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (!d) return false;
      if (d.hero) { Hero.lv = d.hero.lv; Hero.exp = d.hero.exp; Hero.maxhp = d.hero.maxhp; Hero.atkBonus = d.hero.atkBonus; Hero.weapon = d.hero.weapon; Hero.armor = d.hero.armor; Hero.items = d.hero.items || []; }
      tutorialDone = !!d.tutorialDone; storyStage = d.storyStage || 0;
      zukanSet.clear(); (d.zukan || []).forEach(function (x) { zukanSet.add(x); });
      meikanSet.clear(); (d.meikan || []).forEach(function (x) { meikanSet.add(x); });
      tourCleared.clear(); (d.tour || []).forEach(function (x) { tourCleared.add(x); });
      tourReward = !!d.tourReward;
      return true;
    } catch (e) { return false; }
  }

  // ===================== Story text (→ dialogue.js) =====================
  const MUSEUM_INTRO = DIALOGUE.museum_intro;
  const FIELD_INTRO = DIALOGUE.field_intro;

  // ===================== Field scene =====================
  function makeField(mapKey, spawnOverride, introLines) {
    const def = mapKey === 'museum' ? MUSEUM : FIELD;
    const map = parseMap(def, mapKey);
    const sp = spawnOverride || map.spawn;
    const player = { x: sp.col * TILE + TILE / 2, y: sp.row * TILE + TILE / 2, facing: 'down', kind: 'oda' };
    let intro = introLines;
    const SPEED = 132, HALF = 11;
    let sceneActors = [], anim = null;
    function startWalkIn(actor, toY, speed, onDone) {
      actor.moving = true;
      anim = function (dt) { actor.y += speed * dt; if (actor.y >= toY) { actor.y = toY; actor.moving = false; anim = null; if (onDone) onDone(); } };
    }

    function canWalk(cx, cy) {
      const pts = [
        [cx - HALF, cy - HALF], [cx + HALF, cy - HALF], [cx - HALF, cy + HALF], [cx + HALF, cy + HALF],
        [cx - HALF, cy], [cx + HALF, cy], [cx, cy - HALF], [cx, cy + HALF],
      ];
      for (let k = 0; k < pts.length; k++) {
        const col = Math.floor(pts[k][0] / TILE), row = Math.floor(pts[k][1] / TILE);
        if (row < 0 || col < 0 || row >= map.grid.length || col >= map.grid[0].length) return false;
        if (SOLID[mapKey].has(map.grid[row][col])) return false;
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
      else if (id === 'door') Dialog.start(DIALOGUE.door_trigger, function () {
        const ike = { x: 7 * TILE + TILE / 2, y: TILE * 3.0, kind: 'ike', facing: 'down' };
        sceneActors.push(ike);
        player.facing = 'up';
        startWalkIn(ike, player.y - TILE * 1.25, 135, function () {
          Dialog.start(DIALOGUE.door_ike_comedy, function () {
            unlockMeikan('ike');
            startBattle({
              gated: false, spar: true,
              enemy: { name: '池田輝政', hp: 24, kind: 'ike', atkLabel: DIALOGUE.battle.ike_spar.atkLabel, winMsg: DIALOGUE.battle.ike_spar.winMsg, forcelose: true },
              onWin: function () { startTransition(function () { setScene(makeField('field', null, FIELD_INTRO)); }); },
              onLose: function () { startTransition(function () { setScene(makeField('field', null, FIELD_INTRO)); }); }
            });
          });
        });
      });
      else if (id === 'ike') Dialog.start(DIALOGUE.ike_idle);
      else if (id === 'mound') { unlockZukan('shonyu'); unlockMeikan('tsuneoki'); Dialog.start(DIALOGUE.mound); }
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
            startBattle({
              gated: false,
              enemy: {
                name: '踊り子', hp: 50, kind: 'odoriko',
                atkLabel: DIALOGUE.battle.odoriko.atkLabel, appearMsg: DIALOGUE.battle.odoriko.appearMsg,
                winMsg: DIALOGUE.battle.odoriko.winMsg,
              },
              onWin: function () { startTransition(function () { setScene(makeEpilogue()); }); },
              onLose: function () { startTransition(function () { setScene(makeEpilogue()); }); },
            });
          });
        }
      }
    }

    let stepAcc = 0, encCooldown = 2.5;
    return {
      enter: function () {
        activeField = this; if (mapKey === 'field') unlockZukan('kosenjo');
        if (intro) {
          if (mapKey === 'museum') {
            sceneActors.push({ x: 8 * TILE + TILE / 2, y: 5 * TILE + TILE / 2, kind: 'odoriko', facing: 'down', alpha: 1 });
          }
          Dialog.start(intro);
          intro = null;
        }
      },
      update: function (dt) {
        updateParts(dt);
        spawnFieldParts(mapKey);
        if (anim) { anim(dt); return; }
        if (Dialog.active && Dialog.lines[Dialog.i] && Dialog.lines[Dialog.i].name === 'オダ') {
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
        if ((dx !== 0 || dy !== 0) && tutorialDone && mapKey === 'field' && encCooldown <= 0) {
          stepAcc += sp;
          if (stepAcc > 40) {
            stepAcc = 0;
            const tc = Math.floor(player.x / TILE), tr = Math.floor(player.y / TILE);
            const t = map.grid[tr] && map.grid[tr][tc];
            if ((t === '.' || t === ',') && Math.random() < 0.07) { encCooldown = 3.5; startTransition(function () { startBattle({ gated: false }); }); return; }
          }
        }
        if (Input.pressed('confirm')) interact();
        if (Input.pressed('cancel')) setScene(makeMenu(activeField));
      },
      render: function (c) {
        drawField(c, map, player);
        for (let i = 0; i < sceneActors.length; i++) {
          const a = sceneActors[i];
          if (a.kind === 'odoriko' && ODORIKO_BATTLE_IMG) {
            var oh = TILE * 3, ow = oh * (ODORIKO_BATTLE_IMG.width / ODORIKO_BATTLE_IMG.height);
            c.save(); c.globalAlpha = a.alpha != null ? a.alpha : 1;
            c.drawImage(ODORIKO_BATTLE_IMG, a.x - ow / 2, a.y - oh + TILE / 2, ow, oh);
            c.restore();
          } else {
            drawActor(c, a.x, a.y, a.kind, a.facing, 1, a.moving, a.alpha);
          }
        }
        drawVignette(c); if (Dialog.active) Dialog.render(c);
      },
    };
  }

  // ===================== Battle scene =====================
  function startBattle(opts) {
    opts = opts || {};
    const gated = !!opts.gated;
    const e = opts.enemy || {};
    const hp = e.hp || 22;
    const enemy = {
      name: e.name || '落武者のもののけ', hp: hp, maxhp: hp, broken: false, weakKnown: !gated, shake: 0,
      kind: e.kind || 'enemy', spar: !!opts.spar, forcelose: !!e.forcelose,
      atkLabel: e.atkLabel || DIALOGUE.battle.random.atkLabel, winMsg: e.winMsg || DIALOGUE.battle.random.winMsg,
      loseMsg: e.loseMsg || null, appearMsg: e.appearMsg || null,
    };
    const player = { name: 'オダ', hp: Hero.maxhp, maxhp: Hero.maxhp, lv: Hero.lv, miyaLv: miyaLvFromLv(Hero.lv), atkBonus: Hero.atkBonus, wAtk: weaponAtk(), aDef: armorDef() };
    setScene(makeBattle(enemy, player, gated,
      opts.onWin || function () { startTransition(function () { setScene(activeField); }); },
      opts.onLose || function () { startTransition(function () { setScene(makeTitle()); }); }));
  }
  function makeBattle(enemy, player, gated, onWin, onLose) {
    const commands = ['たたかう', 'みやぶる', 'にげる'];
    let cursor = 0;
    let mode = 'msg';
    let msg = '';
    let after = null;
    let endKind = null;
    let shake = 0, flash = 0;
    const popups = [];

    function showMsg(t, fn) { mode = 'msg'; msg = t; after = fn || null; }
    function openMenu() { mode = 'menu'; msg = ''; }
    function addPopup(text, x, y, color) { popups.push({ text: text, x: x, y: y, life: 1.0, color: color }); }
    function hitEnemy(dmg, crit) {
      enemy.hp -= dmg; if (enemy.hp < 0) enemy.hp = 0;
      enemy.shake = crit ? 0.5 : 0.3;
      flash = crit ? 0.5 : 0.28;
      if (crit) shake = 7;
      addPopup((crit ? '会心 ' : '') + dmg, W / 2, 150, crit ? '#ffd43b' : '#fff');
    }
    function hitPlayer(dmg) {
      player.hp -= dmg; if (player.hp < 0) player.hp = 0;
      shake = 5; flash = 0.2;
      addPopup('' + dmg, 110, 250, '#ff8787');
    }
    function winSequence() {
      if (gated) { tutorialDone = true; storyStage = 1; }
      const reward = rnd(5, 8);
      Hero.exp += reward;
      const seq = [enemy.winMsg, '経験値を ' + reward + ' 手に入れた！'];
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
        var fdmg = rnd(14, 18); hitPlayer(fdmg);
        showMsg(enemy.atkLabel + '！\nオダは ' + fdmg + 'の ダメージ！', function () {
          if (player.hp <= 0) {
            if (enemy.spar) showMsg('オダは 膝を ついた…！\nいけ「はは、まだまだ だな。…だが、筋は 悪くない」', function () { mode = 'end'; endKind = 'win'; msg = '（Z / タップで つづける）'; });
            else showMsg('オダは目の前が真っ暗に…！', function () { mode = 'end'; endKind = 'lose'; msg = enemy.loseMsg || '気を失った…（Z / タップで タイトルへ）'; });
          } else openMenu();
        });
        return;
      }
      if (Math.random() < 0.22) { showMsg(enemy.atkLabel + '！\nオダは ひらりと身をかわした！', openMenu); return; }
      const dmg = Math.max(1, rnd(3, 6) - player.aDef); hitPlayer(dmg);
      showMsg(enemy.atkLabel + '！ オダは ' + dmg + 'のダメージ！', function () {
        if (player.hp <= 0) {
          if (enemy.spar) showMsg('オダは 膝を ついた…！\nいけ「はは、まだまだ だな。…だが、筋は 悪くない」', function () { mode = 'end'; endKind = 'win'; msg = '（Z / タップで つづける）'; });
          else showMsg('オダは目の前が真っ暗に…！', function () { mode = 'end'; endKind = 'lose'; msg = enemy.loseMsg || '気を失った…（Z / タップで タイトルへ）'; });
        } else openMenu();
      });
    }
    function miyaTier(lv) {
      const r = Math.random();
      if (lv >= 3) { if (r < 0.30) return 0; if (r < 0.75) return 1; return 2; }
      if (lv >= 2) { if (r < 0.55) return 0; if (r < 0.92) return 1; return 2; }
      if (r < 0.82) return 0; return 1;
    }
    function playerTurn(cmd) {
      if (cmd === 0) {
        if (enemy.forcelose) { showMsg('オダの こうげき！\nしかし いけは 軽く 受け流した！', enemyTurn); return; }
        if (!enemy.weakKnown) { showMsg('オダのこうげき！\nしかし手ごたえがない…！ まず「みやぶる」で 弱点を さがそう。', enemyTurn); return; }
        if (Math.random() < 0.16) { showMsg('オダのこうげき！\nしかし攻撃は 空を切った…！', enemyTurn); return; }
        let dmg = rnd(5, 8) + player.atkBonus + player.wAtk;
        if (enemy.broken) dmg += 3;
        const crit = Math.random() < 0.18;
        if (crit) { dmg = Math.floor(dmg * 1.8); hitEnemy(dmg, true); showMsg('オダのこうげき！ 急所に当たった！\n' + dmg + 'の大ダメージ！', enemyTurn); }
        else { hitEnemy(dmg, false); showMsg('オダのこうげき！ ' + dmg + 'のダメージ！', enemyTurn); }
      } else if (cmd === 1) {
        if (enemy.forcelose) { showMsg('オダは 相手を みやぶろうとした！\nしかし いけは まるで 隙を 見せない…！', enemyTurn); return; }
        enemy.broken = true; enemy.weakKnown = true;
        const tier = miyaTier(player.miyaLv);
        if (enemy.kind === 'enemy') {
          if (tier === 0) {
            showMsg('オダは敵をみやぶった！\n「この子…戦で散った兵の無念か…」\n弱点が見えた！（守りが下がった）', enemyTurn);
          } else if (tier === 1) {
            const d = 5; hitEnemy(d, false); showMsg('オダの観察眼が冴えた！【みやぶる＋】\n「落武者は“塚”に心を残してる…」\n心の隙を突いた！ ' + d + 'のダメージ！', enemyTurn);
          } else {
            const d = 9; hitEnemy(d, false); showMsg('オダは心眼を開いた！【みやぶる・極】\n「無念は ちゃんと残ってる。もう休んで」\n落武者の心がやわらいだ！ ' + d + 'のダメージ！', enemyTurn);
          }
        } else {
          if (tier === 0) {
            showMsg('オダは 相手を みやぶった！\n構えの 隙が 見えた！（守りが下がった）', enemyTurn);
          } else if (tier === 1) {
            const d = 5; hitEnemy(d, false); showMsg('オダの 観察眼が 冴えた！【みやぶる＋】\n隙を 突いた！ ' + d + 'のダメージ！', enemyTurn);
          } else {
            const d = 9; hitEnemy(d, false); showMsg('オダは 心眼を 開いた！【みやぶる・極】\n完全に 見切った！ ' + d + 'のダメージ！', enemyTurn);
          }
        }
      } else {
        showMsg(enemy.spar ? 'いけ「逃げるな、オダ！ これも 修行だ！」' : 'みち「逃げるな、お前！ ここで覚えるんだよ！」', enemyTurn);
      }
    }

    return {
      enter: function () { showMsg(enemy.spar ? 'いけが 構えた！ 腕試しだ！' : (enemy.appearMsg || DIALOGUE.battle.random.appearMsg), openMenu); },
      update: function (dt) {
        updateParts(dt);
        spawnBattleParts();
        if (shake > 0) { shake -= dt * 30; if (shake < 0) shake = 0; }
        if (flash > 0) { flash -= dt * 1.6; if (flash < 0) flash = 0; }
        if (enemy.shake > 0) { enemy.shake -= dt; if (enemy.shake < 0) enemy.shake = 0; }
        for (let i = popups.length - 1; i >= 0; i--) { const p = popups[i]; p.y -= dt * 38; p.life -= dt * 1.1; if (p.life <= 0) popups.splice(i, 1); }
        if (mode === 'menu') {
          if (Input.pressed('up')) cursor = (cursor + commands.length - 1) % commands.length;
          if (Input.pressed('down')) cursor = (cursor + 1) % commands.length;
          if (Input.pressed('confirm')) playerTurn(cursor);
        } else if (mode === 'msg') {
          if (Input.pressed('confirm')) { const fn = after; after = null; if (fn) fn(); }
        } else if (mode === 'end') {
          if (Input.pressed('confirm')) { if (endKind === 'win') onWin(); else onLose(); }
        }
      },
      render: function (c) { drawBattle(c, enemy, player, commands, cursor, mode, msg, shake, flash, popups); drawParts(c); },
    };
  }
  function drawBattle(c, enemy, player, commands, cursor, mode, msg, shake, flash, popups) {
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
    // Distant hills silhouette
    c.fillStyle = '#0e1520';
    c.beginPath(); c.moveTo(0, 180);
    c.quadraticCurveTo(80, 155, 160, 172); c.quadraticCurveTo(260, 150, 360, 168);
    c.quadraticCurveTo(440, 155, W, 175); c.lineTo(W, 200); c.lineTo(0, 200); c.closePath(); c.fill();
    c.fillStyle = '#121e12';
    c.beginPath(); c.moveTo(0, 188);
    c.quadraticCurveTo(120, 172, 256, 182); c.quadraticCurveTo(380, 170, W, 185);
    c.lineTo(W, 200); c.lineTo(0, 200); c.closePath(); c.fill();
    c.save();
    var sx = shake > 0 ? (Math.random() * 2 - 1) * shake : 0;
    var sy = shake > 0 ? (Math.random() * 2 - 1) * shake : 0;
    c.translate(sx, sy);
    // Ground layers
    c.fillStyle = '#1a2810';
    c.beginPath(); c.moveTo(0, 195); c.quadraticCurveTo(W / 2, 186, W, 193); c.lineTo(W, 250); c.lineTo(0, 250); c.closePath(); c.fill();
    c.fillStyle = '#223814';
    c.beginPath(); c.moveTo(0, 202); c.quadraticCurveTo(W / 2, 194, W, 200); c.lineTo(W, 250); c.lineTo(0, 250); c.closePath(); c.fill();
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
      var auraColor = enemy.kind === 'odoriko' ? 'rgba(100,60,140,' : 'rgba(60,20,100,';
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
    if (!enemy.forcelose) drawHPBar(c, W / 2 - 80, 216, 160, enemy.hp, enemy.maxhp, '#e8590c');
    c.textAlign = 'left';
    c.fillStyle = '#cdd9ff'; c.font = '15px "Hiragino Sans",sans-serif';
    c.fillText('オダ　Lv' + player.lv + '　HP ' + player.hp + '/' + player.maxhp, 22, 296);
    drawHPBar(c, 22, 304, 170, player.hp, player.maxhp, '#37b24d');
    if (mode === 'menu') {
      drawTextbox(c, '', 'どうする？', false, true);
      const cx = W - 196, cy = 286, cw = 184, chh = 24 + commands.length * 30;
      c.fillStyle = 'rgba(8,16,40,0.97)'; roundRect(c, cx, cy, cw, chh, 10); c.fill();
      c.strokeStyle = '#cdd9ff'; c.lineWidth = 2; roundRect(c, cx + 2, cy + 2, cw - 4, chh - 4, 8); c.stroke(); c.lineWidth = 1;
      c.font = '19px "Hiragino Sans",sans-serif';
      for (let i = 0; i < commands.length; i++) {
        c.fillStyle = i === cursor ? '#ffd43b' : '#f1f3f5';
        let label = commands[i];
        if (i === 1) label += ' Lv' + player.miyaLv;
        c.fillText((i === cursor ? '▶ ' : '　 ') + label, cx + 16, cy + 32 + i * 30);
      }
    } else {
      drawTextbox(c, '', msg, mode === 'msg' || mode === 'end', true);
    }
    if (flash > 0) { c.fillStyle = 'rgba(255,255,255,' + Math.min(0.6, flash) + ')'; c.fillRect(0, 0, W, H); }
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
          if (opts[cur] === 'つづきから') { if (loadGame()) startTransition(function () { setScene(makeField('field', null, null)); }); }
          else if (opts[cur] === '史跡めぐり') { if (hasSave()) loadGame(); setScene(makeSiteTour()); }
          else setScene(makeField('museum', null, MUSEUM_INTRO));
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
          var lh = 140, lw = lh * (TITLE_LOGO_IMG.width / TITLE_LOGO_IMG.height);
          var lcx = W / 2, lcy = 30 + lh / 2;
          c.save();
          var lg = c.createRadialGradient(lcx, lcy, lh * 0.15, lcx, lcy, lw * 0.55);
          lg.addColorStop(0, 'rgba(10,14,28,0.7)');
          lg.addColorStop(0.7, 'rgba(10,14,28,0.3)');
          lg.addColorStop(1, 'rgba(10,14,28,0)');
          c.fillStyle = lg;
          c.fillRect(lcx - lw * 0.6, lcy - lh * 0.6, lw * 1.2, lh * 1.2);
          c.restore();
          c.drawImage(TITLE_LOGO_IMG, W / 2 - lw / 2, 30, lw, lh);
          c.fillStyle = '#8a9ab0'; c.font = '12px "Hiragino Sans",sans-serif';
          c.fillText('長久手市文化の家『合戦ズ』(作: 麻原奈未) より', W / 2, 182);
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
    const map = parseMap(MUSEUM, 'museum');
    const oda = { x: 7 * TILE + TILE / 2, y: 8 * TILE + TILE / 2, kind: 'oda', facing: 'up' };
    const kancho = { x: 7 * TILE + TILE / 2, y: 5 * TILE + TILE / 2, kind: 'kancho', facing: 'down' };
    return {
      enter: function () { Dialog.start(EPILOGUE, function () { startTransition(function () { setScene(makeEnding()); }); }); },
      update: function (dt) { if (Dialog.active) Dialog.update(dt); },
      render: function (c) {
        for (let r = 0; r < map.grid.length; r++) {
          for (let col = 0; col < map.grid[r].length; col++) drawTile(c, map.grid[r][col], col * TILE, r * TILE, map.key);
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

  // ===================== 史跡めぐり（サイドクエスト：学び→クイズ→戦闘） =====================
  // 長久手の実在する史跡をめぐり、小エピソードで学び、歴史クイズに答え、もののけと戦う。
  // 勝つと史跡図鑑が解放される。シティプロモーション＆学習の中心機能。
  const SITES = DIALOGUE.sites;

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
        const n = SITES.length + 1; // 末尾に「もどる」
        if (Input.pressed('up')) cur = (cur + n - 1) % n;
        if (Input.pressed('down')) cur = (cur + 1) % n;
        if (Input.pressed('cancel')) { setScene(makeTitle()); return; }
        if (Input.pressed('confirm')) {
          if (cur === SITES.length) { setScene(makeTitle()); return; }
          setScene(makeSiteVisit(SITES[cur]));
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
    let y = 132;
    for (let i = 0; i < SITES.length; i++) {
      const s = SITES[i], done = tourCleared.has(s.id), sel = i === cur;
      const bx = 40, bw = W - 80, bh = 38;
      c.fillStyle = sel ? 'rgba(255,212,59,0.16)' : 'rgba(255,255,255,0.05)';
      roundRect(c, bx, y, bw, bh, 8); c.fill();
      if (sel) { c.strokeStyle = '#ffd43b'; c.lineWidth = 2; roundRect(c, bx, y, bw, bh, 8); c.stroke(); c.lineWidth = 1; }
      c.fillStyle = done ? '#37b24d' : (sel ? '#ffd43b' : '#cdd9ff');
      c.font = 'bold 18px "Hiragino Sans",sans-serif';
      c.fillText((sel ? '▶ ' : '　 ') + s.name, bx + 14, y + 25);
      c.fillStyle = '#9aa7c0'; c.font = '12px "Hiragino Sans",sans-serif';
      c.fillText(s.sub, bx + bw - 120, y + 16);
      c.fillStyle = done ? '#37b24d' : '#6b7894'; c.font = '13px "Hiragino Sans",sans-serif';
      c.fillText(done ? '踏破ずみ ✓' : '未踏破', bx + bw - 120, y + 31);
      y += 46;
    }
    const sel2 = cur === SITES.length;
    c.fillStyle = sel2 ? '#ffd43b' : '#cdd9ff'; c.font = (sel2 ? 'bold ' : '') + '17px "Hiragino Sans",sans-serif';
    c.fillText((sel2 ? '▶ ' : '　 ') + 'タイトルへ もどる', 54, y + 22);
    c.fillStyle = '#868e96'; c.font = '12px "Hiragino Sans",sans-serif'; c.textAlign = 'center';
    c.fillText('↑ ↓ 選択　　Z 決定　　X / B もどる', W / 2, H - 14);
    c.textAlign = 'left';
  }

  function makeSiteVisit(site) {
    let phase = 'episode'; // episode → quiz → 踏破
    let qcur = 0, answered = false, correct = false;
    return {
      enter: function () { Dialog.start(site.episode, function () { phase = 'quiz'; }); },
      update: function (dt) {
        if (phase === 'episode') { if (Dialog.active) Dialog.update(dt); return; }
        // quiz
        const ch = site.quiz.choices;
        if (!answered) {
          if (Input.pressed('cancel')) { setScene(makeSiteTour()); return; }
          if (Input.pressed('up')) qcur = (qcur + ch.length - 1) % ch.length;
          if (Input.pressed('down')) qcur = (qcur + 1) % ch.length;
          if (Input.pressed('confirm')) { answered = true; correct = (qcur === site.quiz.answer); }
        } else {
          if (Input.pressed('confirm')) {
            unlockZukan(site.id); tourCleared.add(site.id); saveGame();
            startTransition(function () { setScene(makeSiteTour()); });
          }
        }
      },
      render: function (c) {
        drawSiteBg(c, site);
        if (phase === 'episode') { if (Dialog.active) Dialog.render(c); }
        else drawQuiz(c, site, qcur, answered, correct);
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
