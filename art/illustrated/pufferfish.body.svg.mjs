// Pufferfish body: round, olive-tan above with dark spots, pale belly. Spots are seeded.
import { rng, f1 } from './_lib.mjs';

const BODY = 'M158,78 C158,58 146,36 124,28 C106,22 84,22 68,30 C54,38 46,50 42,61 L40,64 L40,82 C46,97 58,112 78,120 C98,126 120,124 136,114 C150,104 158,92 158,78 Z';

export default function pufferBody() {
  const r = rng(808);
  const spots = [];
  let tries = 0;
  while (spots.length < 34 && tries++ < 2000) {
    const x = r.range(46, 152);
    const y = r.range(26, 98);
    const s = r.range(2.4, 4.6);
    const inside = ((x - 99) / 56) ** 2 + ((y - 73) / 49) ** 2 < 0.86;
    const nearEye = (x - 131) ** 2 + (y - 55) ** 2 < 15 ** 2;
    const nearMouth = x > 146 && y > 70;
    const belly = y > 92 - (x - 99) * 0.1;
    if (!inside || nearEye || nearMouth || belly) continue;
    if (spots.some(([sx, sy, ss]) => Math.hypot(sx - x, sy - y) < ss + s + 4)) continue;
    spots.push([x, y, s]);
  }
  const spotSvg = spots.map(([x, y, s]) => `<ellipse cx="${f1(x)}" cy="${f1(y)}" rx="${f1(s)}" ry="${f1(s * 0.9)}" fill="#33261a"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="170" height="140" viewBox="0 0 170 140">
<defs>
<linearGradient id="b" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="#7a6838"/><stop offset="0.38" stop-color="#bba66c"/><stop offset="0.66" stop-color="#e6dab6"/><stop offset="1" stop-color="#f8f2e0"/>
</linearGradient>
<radialGradient id="hl" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#ffffff" stop-opacity="0.5"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>
<radialGradient id="iris" cx="0.4" cy="0.35" r="0.7"><stop offset="0" stop-color="#c8c060"/><stop offset="1" stop-color="#3e5222"/></radialGradient>
<clipPath id="bc"><path d="${BODY}"/></clipPath>
</defs>
<path d="M82,33 C74,18 62,15 54,21 C51,29 55,38 62,45 Z" fill="#cbb47c" fill-opacity="0.9" stroke="#3e3018" stroke-width="1.6" stroke-linejoin="round"/>
<path d="M80,115 C74,128 63,133 56,129 C53,121 57,112 63,107 Z" fill="#d8c79a" fill-opacity="0.9" stroke="#3e3018" stroke-width="1.6" stroke-linejoin="round"/>
<path d="${BODY}" fill="url(#b)"/>
<g clip-path="url(#bc)">
${spotSvg}
<ellipse cx="108" cy="40" rx="34" ry="12" fill="url(#hl)"/>
<path d="M60,104 C80,112 110,116 150,98" stroke="#d2c6a4" stroke-width="1.2" fill="none" opacity="0.8"/>
<path d="M66,110 C86,118 112,120 144,106" stroke="#d2c6a4" stroke-width="1.2" fill="none" opacity="0.7"/>
</g>
<path d="M158,78 C158,58 146,36 124,28 C106,22 84,22 68,30 C54,38 46,50 42,61 L40,64 M40,82 C46,97 58,112 78,120 C98,126 120,124 136,114 C150,104 158,92 158,78" fill="none" stroke="#3e3018" stroke-width="2.2" stroke-linejoin="round"/>
<circle cx="131" cy="55" r="9.5" fill="#efe4c2" stroke="#3e3018" stroke-width="1.4"/>
<circle cx="131" cy="55" r="7" fill="url(#iris)"/>
<circle cx="131.5" cy="55.5" r="4" fill="#0a0a06"/>
<circle cx="129" cy="52.6" r="1.8" fill="#ffffff" opacity="0.9"/>
<path d="M156.5,77 C160,78.5 160.5,84.5 156.5,86 C155,84 155,79 156.5,77 Z" fill="#f4ecd8" stroke="#3e3018" stroke-width="1.3"/>
<path d="M156,81.5 L159.6,81.5" stroke="#3e3018" stroke-width="1"/>
</svg>`;
}
