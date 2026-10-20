// 角色立绘的矢量定义（日系风格）。画布 900×1440，人物居中，x=450 为中轴。
// 每个角色 = 发型 + 配色 + 配饰；表情由 EXPRESSIONS 中的参数组合而成。

const OUTLINE = 'rgba(45,28,45,0.6)';
const SKIN = '#ffe9dc';
const SKIN_SHADE = '#f4c9b8';

// 刘海轮廓（也用于在额头上投下阴影）
const BAIZHI_BANGS = `M 284,390 C 262,200 352,112 450,112 C 548,112 638,200 616,390
  L 590,368 Q 574,334 560,306 Q 552,342 536,362 Q 520,330 506,310 Q 496,346 480,366
  Q 468,334 455,314 Q 444,344 430,364 Q 418,334 402,310 Q 390,346 374,368
  Q 362,334 346,306 Q 334,342 314,368 Z`;
const SUQING_BANGS = `M 282,400 C 258,196 350,116 450,116 C 552,116 644,196 618,400
  Q 602,350 590,312 Q 578,342 566,362 Q 548,318 520,292 Q 518,330 504,356
  Q 480,316 446,296 Q 444,330 426,360 Q 408,322 380,302 Q 382,336 362,366
  Q 346,334 330,316 Q 318,350 306,384 Z`;

const FACE = 'M 300,320 C 298,430 338,500 395,537 Q 450,572 505,537 C 562,500 602,430 600,320 Q 600,180 450,175 Q 300,180 300,320 Z';

const mirror = (inner) => `<g transform="translate(900,0) scale(-1,1)">${inner}</g>`;
const pair = (inner) => inner + mirror(inner);

// ---------------- 表情 ----------------
// eye: open | happy（^^ 闭眼笑）  lid: 上眼睑下压比例  iris: 瞳孔缩放
// brow: normal | up | sad | angry   mouth: 见 mouthPath   blush: 0~1
export const EXPRESSIONS = {
  normal: { eye: 'open', lid: 0, iris: 1, brow: 'normal', mouth: 'flat', blush: 0.25 },
  smile: { eye: 'open', lid: 0.12, iris: 1, brow: 'normal', mouth: 'smile', blush: 0.45 },
  laugh: { eye: 'happy', brow: 'up', mouth: 'open', blush: 0.55 },
  surprised: { eye: 'open', lid: 0, iris: 0.78, brow: 'up', mouth: 'o', blush: 0.3 },
  sad: { eye: 'open', lid: 0.3, iris: 1, brow: 'sad', mouth: 'frown', blush: 0.15 },
  pout: { eye: 'open', lid: 0.38, iris: 1, brow: 'angry', mouth: 'wavy', blush: 0.7 },
};

function eye(c, ex) {
  // 以左眼（画面左侧）为基准、眼中心为原点绘制；外眼角在左
  const white = 'M -52,-6 C -42,-50 20,-58 47,-22 L 41,30 Q 2,62 -42,46 Z';
  if (ex.eye === 'happy') {
    return `
      <path d="M -50,14 Q -4,-34 44,10" fill="none" stroke="${c.lash}" stroke-width="9" stroke-linecap="round"/>
      <path d="M -50,14 L -64,22" stroke="${c.lash}" stroke-width="7" stroke-linecap="round"/>`;
  }
  const s = ex.iris;
  const lidY = -50 + ex.lid * 100;
  return `
    <clipPath id="eyeclip"><path d="${white}"/></clipPath>
    <path d="${white}" fill="#fffdfb"/>
    <g clip-path="url(#eyeclip)">
      <ellipse cx="0" cy="10" rx="${37 * s}" ry="${49 * s}" fill="url(#iris)"/>
      <ellipse cx="0" cy="14" rx="${17 * s}" ry="${25 * s}" fill="${c.pupil}"/>
      <ellipse cx="0" cy="${10 - 34 * s}" rx="${37 * s}" ry="${18 * s}" fill="${c.irisTop}" opacity="0.7"/>
      <ellipse cx="0" cy="${10 + 34 * s}" rx="${24 * s}" ry="${10 * s}" fill="#ffffff" opacity="0.28"/>
      <ellipse cx="${-14 * s}" cy="${-8 * s}" rx="${12 * s}" ry="${16 * s}" fill="#fff"/>
      <circle cx="${16 * s}" cy="${30 * s}" r="${6 * s}" fill="#fff" opacity="0.9"/>
      ${ex.lid > 0 ? `<rect x="-70" y="-80" width="140" height="${lidY + 80}" fill="${SKIN}"/>` : ''}
    </g>
    ${ex.lid > 0
      ? `<path d="M -58,${lidY + 6} Q -4,${lidY - 8} 50,${lidY + 2}" fill="none" stroke="${c.lash}" stroke-width="11" stroke-linecap="round"/>`
      : `<path d="M -60,-2 C -48,-54 24,-64 52,-26 L 46,-16 C 18,-48 -38,-44 -50,-2 Z" fill="${c.lash}"/>
         <path d="M -52,-8 L -68,6 L -49,0 Z" fill="${c.lash}"/>`}
    <path d="M -38,47 Q 2,60 34,44" fill="none" stroke="${c.lash}" stroke-width="3" opacity="0.7" stroke-linecap="round"/>`;
}

function brow(c, kind) {
  const d = {
    normal: 'M -46,-74 Q -2,-90 40,-78',
    up: 'M -46,-90 Q -2,-108 40,-94',
    sad: 'M -46,-72 Q -4,-84 38,-98',
    angry: 'M -46,-88 Q -4,-84 38,-70',
  }[kind];
  return `<path d="${d}" fill="none" stroke="${c.brow}" stroke-width="5" stroke-linecap="round" opacity="0.7"/>`;
}

function mouthPath(kind) {
  const line = (d) => `<path d="${d}" fill="none" stroke="#a8505a" stroke-width="4.5" stroke-linecap="round"/>`;
  switch (kind) {
    case 'smile': return line('M 430,506 Q 450,520 470,506');
    case 'open': return `
      <path d="M 424,500 Q 450,506 476,500 Q 468,536 450,538 Q 432,536 424,500 Z" fill="#b2485a" stroke="#7a2c3a" stroke-width="2.5"/>
      <ellipse cx="450" cy="528" rx="13" ry="7" fill="#f08a96"/>`;
    case 'o': return `<ellipse cx="450" cy="516" rx="11" ry="15" fill="#b2485a" stroke="#7a2c3a" stroke-width="2.5"/>`;
    case 'frown': return line('M 434,516 Q 450,505 466,516');
    case 'wavy': return line('M 432,512 q 9,-7 18,0 q 9,7 18,0');
    default: return line('M 434,509 Q 450,514 466,508');
  }
}

function face(c, ex) {
  const blush = ex.blush;
  const hatch = blush >= 0.45
    ? pair(`<path d="M 342,470 l -8,14 M 356,470 l -8,14 M 370,470 l -8,14" stroke="#e8808a" stroke-width="3" stroke-linecap="round" opacity="0.8"/>`)
    : '';
  return `
    ${pair(`<ellipse cx="300" cy="420" rx="16" ry="30" fill="${SKIN}" stroke="${OUTLINE}" stroke-width="2.5"/>`)}
    <path d="${FACE}"
      fill="${SKIN}" stroke="${OUTLINE}" stroke-width="3"/>
    ${pair(`<ellipse cx="358" cy="476" rx="40" ry="15" fill="#ff8a9a" opacity="${blush}" filter="url(#soft)"/>`)}
    ${hatch}
    <g transform="translate(385,420)">${eye(c, ex)}</g>
    <g transform="translate(515,420) scale(-1,1)">${eye(c, ex)}</g>
    <path d="M 451,468 l -5,13 l 8,1" fill="none" stroke="${SKIN_SHADE}" stroke-width="3.5" stroke-linecap="round"/>
    ${mouthPath(ex.mouth)}`;
}

function brows(c, ex) {
  return `<g transform="translate(385,420)">${brow(c, ex.brow)}</g>
          <g transform="translate(515,420) scale(-1,1)">${brow(c, ex.brow)}</g>`;
}

// ---------------- 身体（水手服） ----------------
function body(c) {
  const arm = `
    <path d="M 302,652 C 256,668 240,720 236,800 L 226,985 L 302,996 L 320,760 Z" fill="#f6f7fb" stroke="${OUTLINE}" stroke-width="3"/>
    <path d="M 228,958 L 302,968 L 302,996 L 226,985 Z" fill="${c.navy}"/>
    <path d="M 229,972 L 302,982" stroke="#fff" stroke-width="3"/>
    <path d="M 238,992 C 228,1030 238,1072 262,1082 C 286,1086 298,1050 296,1000 Z" fill="${SKIN}" stroke="${OUTLINE}" stroke-width="3"/>`;
  return `
    <path d="M 410,520 L 490,520 L 494,640 L 406,640 Z" fill="${SKIN}" stroke="${OUTLINE}" stroke-width="3"/>
    <path d="M 408,548 Q 450,606 492,548 L 493,600 Q 450,630 407,600 Z" fill="${SKIN_SHADE}"/>
    <path d="M 315,985 L 585,985 L 655,1440 L 245,1440 Z" fill="${c.navy}" stroke="${OUTLINE}" stroke-width="3"/>
    <path d="M 365,990 L 330,1440 M 415,990 L 405,1440 M 485,990 L 495,1440 M 535,990 L 570,1440" stroke="${c.navyDark}" stroke-width="4"/>
    <path d="M 390,990 L 368,1440 M 510,990 L 532,1440" stroke="${c.navyLight}" stroke-width="3" opacity="0.6"/>
    <path d="M 300,656 C 340,636 380,628 410,624 L 490,624 C 520,628 560,636 600,656 L 592,1000 L 308,1000 Z"
      fill="#f6f7fb" stroke="${OUTLINE}" stroke-width="3"/>
    <path d="M 330,1000 Q 360,900 350,760 M 570,1000 Q 540,900 550,760" stroke="#dfe2ee" stroke-width="10" fill="none"/>
    ${pair(arm)}
    <path d="M 412,628 L 450,770 L 488,628 Z" fill="${c.navy}"/>
    <path d="M 290,662 L 450,848 L 610,662 L 600,648 C 560,638 520,630 490,626 L 450,772 L 410,626 C 380,630 340,638 300,648 Z"
      fill="${c.navy}" stroke="${OUTLINE}" stroke-width="3"/>
    <path d="M 304,672 L 450,830 L 596,672" fill="none" stroke="#fff" stroke-width="5"/>
    <g fill="${c.ribbon}" stroke="${OUTLINE}" stroke-width="2.5">
      <path d="M 442,846 L 418,940 L 444,925 L 452,852 Z"/>
      <path d="M 458,846 L 482,940 L 456,925 L 448,852 Z"/>
      <path d="M 450,832 L 386,806 Q 372,838 390,866 Z"/>
      <path d="M 450,832 L 514,806 Q 528,838 510,866 Z"/>
      <rect x="436" y="818" width="28" height="30" rx="8"/>
    </g>`;
}

// ---------------- 角色 ----------------
function baizhiHair(c, layer) {
  if (layer === 'back') {
    return `
      <path d="M 296,240 C 236,420 222,800 208,1160 L 252,1120 L 290,1170 L 330,1110 L 360,1140 L 380,700
               L 520,700 L 540,1140 L 570,1110 L 610,1170 L 648,1120 L 692,1160 C 678,800 664,420 604,240 Z"
        fill="${c.hair}" stroke="${OUTLINE}" stroke-width="3"/>
      <path d="M 262,500 C 250,700 245,900 240,1100 M 638,500 C 650,700 655,900 660,1100 M 300,600 C 292,800 290,950 288,1120 M 600,600 C 608,800 610,950 612,1120"
        stroke="${c.hairShade}" stroke-width="5" fill="none"/>`;
  }
  const sideLock = `<path d="M 286,290 C 276,450 282,600 286,736 L 352,736 C 340,610 334,470 342,350 Z" fill="${c.hair}" stroke="${OUTLINE}" stroke-width="3"/>
    <path d="M 312,400 C 308,520 312,640 318,730" stroke="${c.hairShade}" stroke-width="4" fill="none"/>`;
  return `
    <path d="${BAIZHI_BANGS}" fill="${c.hair}" stroke="${OUTLINE}" stroke-width="3"/>
    ${pair(sideLock)}
    <path d="M 340,214 Q 450,170 560,214" stroke="${c.hairShine}" stroke-width="14" fill="none" stroke-linecap="round" stroke-dasharray="46 18" opacity="0.75"/>
    <path d="M 380,170 Q 360,260 374,390 M 520,170 Q 540,260 536,386" stroke="${c.hairShade}" stroke-width="4" fill="none"/>
    <g transform="translate(570,262) rotate(20)">
      <path d="M -26,0 L -6,-14 L -6,14 Z M 26,0 L 6,-14 L 6,14 Z" fill="${c.ribbon}" stroke="${OUTLINE}" stroke-width="2"/>
      <circle r="7" fill="${c.ribbon}" stroke="${OUTLINE}" stroke-width="2"/>
    </g>`;
}

function suqingHair(c, layer) {
  if (layer === 'back') {
    return `
      <path d="M 292,250 C 248,400 248,540 262,620 Q 300,640 330,606 L 570,606 Q 600,640 638,620 C 652,540 652,400 608,250 Z"
        fill="${c.hair}" stroke="${OUTLINE}" stroke-width="3"/>`;
  }
  const sideLock = `<path d="M 300,300 C 282,420 284,520 300,590 Q 278,612 252,600 Q 276,590 280,560 C 262,470 268,380 292,300 Z"
      fill="${c.hair}" stroke="${OUTLINE}" stroke-width="3"/>
    <path d="M 296,330 C 300,420 292,520 300,580" stroke="${c.hairShade}" stroke-width="5" fill="none"/>`;
  return `
    ${pair(sideLock)}
    <path d="${SUQING_BANGS}" fill="${c.hair}" stroke="${OUTLINE}" stroke-width="3"/>
    <path d="M 452,118 C 440,70 470,40 512,52 C 478,58 466,84 472,118 Z" fill="${c.hair}" stroke="${OUTLINE}" stroke-width="3"/>
    <path d="M 342,214 Q 450,168 560,214" stroke="${c.hairShine}" stroke-width="14" fill="none" stroke-linecap="round" stroke-dasharray="40 16" opacity="0.8"/>
    <path d="M 392,180 Q 370,270 380,312 M 506,176 Q 520,250 520,300" stroke="${c.hairShade}" stroke-width="4" fill="none"/>
    <g stroke="${OUTLINE}" stroke-width="2">
      <rect x="548" y="262" width="62" height="12" rx="6" fill="${c.ribbon}" transform="rotate(-28 579 268)"/>
      <rect x="552" y="286" width="62" height="12" rx="6" fill="#ffd166" transform="rotate(-28 583 292)"/>
    </g>`;
}

function camera(c) {
  return `
    <path d="M 406,640 C 380,740 380,820 392,880 M 494,640 C 520,740 522,820 506,880" stroke="#3b3b44" stroke-width="7" fill="none"/>
    <rect x="378" y="872" width="144" height="92" rx="14" fill="#3a3a44" stroke="${OUTLINE}" stroke-width="3"/>
    <rect x="392" y="860" width="40" height="18" rx="5" fill="#3a3a44"/>
    <circle cx="450" cy="918" r="34" fill="#22222a" stroke="#8a8a98" stroke-width="5"/>
    <circle cx="450" cy="918" r="18" fill="#2c3e66"/>
    <circle cx="442" cy="910" r="6" fill="#fff" opacity="0.8"/>
    <rect x="490" y="880" width="20" height="10" rx="3" fill="${c.ribbon}"/>`;
}

export const CHARACTERS = {
  baizhi: {
    name: '白芷',
    expressions: ['normal', 'smile', 'surprised', 'sad'],
    colors: {
      hair: '#2b2536', hairShade: '#1a1622', hairShine: '#6a6290', lash: '#2a2030', brow: '#2b2536',
      irisTop: '#262a63', irisBottom: '#8a9be6', pupil: '#141633',
      navy: '#2d3557', navyDark: '#1f2540', navyLight: '#4a5480', ribbon: '#5b7fc4',
    },
    hair: baizhiHair,
    bangs: BAIZHI_BANGS,
  },
  suqing: {
    name: '苏晴',
    expressions: ['normal', 'smile', 'surprised', 'pout'],
    // 苏晴是元气角色，「笑」用闭眼大笑
    expressionMap: { smile: 'laugh' },
    colors: {
      hair: '#b06a3e', hairShade: '#7e4526', hairShine: '#e6a676', lash: '#4a2618', brow: '#8a4e2c',
      irisTop: '#6a3410', irisBottom: '#f0b450', pupil: '#3a1a08',
      navy: '#2d3557', navyDark: '#1f2540', navyLight: '#4a5480', ribbon: '#e5545e',
    },
    hair: suqingHair,
    bangs: SUQING_BANGS,
    extra: camera,
  },
};

export function renderSVG(key, expression) {
  const ch = CHARACTERS[key];
  const c = ch.colors;
  const ex = EXPRESSIONS[(ch.expressionMap ?? {})[expression] ?? expression];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 1440" width="900" height="1440">
  <defs>
    <linearGradient id="iris" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${c.irisTop}"/><stop offset="1" stop-color="${c.irisBottom}"/>
    </linearGradient>
    <filter id="soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6"/></filter>
  </defs>
  ${ch.hair(c, 'back')}
  ${body(c)}
  ${ch.extra ? ch.extra(c) : ''}
  ${face(c, ex)}
  <clipPath id="faceclip"><path d="${FACE}"/></clipPath>
  <path d="${ch.bangs}" transform="translate(0,14)" fill="${SKIN_SHADE}" opacity="0.75" clip-path="url(#faceclip)"/>
  ${ch.hair(c, 'front')}
  ${brows(c, ex)}
</svg>`;
}
