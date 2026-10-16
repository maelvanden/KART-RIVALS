#!/usr/bin/env node
// Génère les visuels du garage virtuel : assets/gear/<id>.svg + src/features/garage/art.ts.
// Formes génériques dessinées à la main, aucun logo ni marque réelle.
// Usage : node scripts/generate-gear-art.mjs (à relancer après avoir modifié ITEMS).
//
// SVG volontairement simple (formes, dégradés, clipPath) : rendu par expo-image sur iOS (SDWebImageSVGCoder),
// Android (androidsvg) et web. Pas de filtres, de masques, de <text> ni de <use>.

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Doit rester aligné sur la table gear_items (migration 20261020000016_user_gear.sql).
const RENTAL = { base: '#7D838D', secondary: '#555B64', accent: '#B9BEC6', pattern: 'worn' };
const NEON = { base: '#17191D', secondary: '#39FF14', accent: '#39FF14', pattern: 'racing' };
const THUNDER = { base: '#1D3B8F', secondary: '#5AA9FF', accent: '#FFC83D', pattern: 'bolt' };
const INFERNO = { base: '#1A1A1C', secondary: '#FF6B1A', accent: '#FFC83D', pattern: 'flame' };
const CARBON = { base: '#2B2E34', secondary: '#16181B', accent: '#FF6B1A', pattern: 'carbon' };
const GOLD = { base: '#F2B630', secondary: '#9C6B0E', accent: '#FFF1BF', pattern: 'checker' };

const ITEMS = {
  'helmet-rental': RENTAL,
  'helmet-street': { base: '#F2F4F7', secondary: '#1C1F25', accent: '#FF3B5C', pattern: 'stripe' },
  'helmet-neon': NEON,
  'helmet-thunder': THUNDER,
  'helmet-inferno': INFERNO,
  'helmet-crown': GOLD,

  'suit-rental': { ...RENTAL, base: '#56627A', secondary: '#3B4456' },
  'suit-classic': { base: '#D7263D', secondary: '#F2F4F7', accent: '#F2F4F7', pattern: 'stripe' },
  'suit-neon': NEON,
  'suit-thunder': THUNDER,
  'suit-carbon': CARBON,
  'suit-champion': { base: '#F2F4F7', secondary: '#C9961F', accent: '#F2B630', pattern: 'checker' },

  'gloves-rental': RENTAL,
  'gloves-grip': { base: '#F2F4F7', secondary: '#1C1F25', accent: '#1C1F25', pattern: 'stripe' },
  'gloves-neon': NEON,
  'gloves-inferno': INFERNO,
  'gloves-gold': GOLD,

  'shoes-rental': RENTAL,
  'shoes-sprint': { base: '#D7263D', secondary: '#F2F4F7', accent: '#F2F4F7', pattern: 'stripe' },
  'shoes-neon': NEON,
  'shoes-thunder': THUNDER,
  'shoes-carbon': CARBON,

  'rib-rental': RENTAL,
  'rib-shield': { base: '#1C1F25', secondary: '#F2F4F7', accent: '#F2F4F7', pattern: 'stripe' },
  'rib-neon': NEON,
  'rib-titan': CARBON,
  'rib-legend': { base: '#FF6B1A', secondary: '#7A2600', accent: '#FFC83D', pattern: 'flame' },
};

// ---------- Silhouettes (viewBox 0 0 120 120) ----------
// body : formes qui portent la livrée (et servent de clipPath) ; front : détails par-dessus.
const SHAPES = {
  helmet: {
    body: ['<path d="M18 74 C16 44 38 18 66 18 C93 18 107 40 106 66 L105 80 C104 87 99 91 92 91 L36 91 C25 91 18 85 18 74 Z"/>'],
    front: ({ dark }) => `
      <path d="M58 48 C74 42 94 43 104 51 L105 67 L68 69 C60 69 55 57 58 48 Z" fill="${dark}"/>
      <path d="M64 50 C76 46 90 46 99 51 L99 55 C89 51 76 51 65 55 Z" fill="#FFFFFF" fill-opacity="0.35"/>
      <path d="M58 48 C74 42 94 43 104 51" fill="none" stroke="#000000" stroke-opacity="0.35" stroke-width="2"/>
      <rect x="30" y="88" width="64" height="9" rx="4" fill="${dark}"/>
      <circle cx="56" cy="60" r="3" fill="#000000" fill-opacity="0.35"/>
      <path d="M24 80 L100 80" stroke="#000000" stroke-opacity="0.18" stroke-width="2"/>`,
  },
  suit: {
    body: [
      '<path d="M44 14 L76 14 L92 21 C99 24 102 30 103 37 L109 72 L95 75 L89 46 L88 64 L90 110 L64 110 L60 74 L56 110 L30 110 L32 64 L31 46 L25 75 L11 72 L17 37 C18 30 21 24 28 21 Z"/>',
    ],
    front: ({ dark }) => `
      <path d="M48 14 L72 14 L68 22 L52 22 Z" fill="${dark}"/>
      <path d="M60 22 L60 68" stroke="#000000" stroke-opacity="0.35" stroke-width="2"/>
      <rect x="31" y="60" width="58" height="6" rx="2" fill="#000000" fill-opacity="0.25"/>
      <rect x="11" y="68" width="14" height="6" rx="2" fill="${dark}"/>
      <rect x="95" y="68" width="14" height="6" rx="2" fill="${dark}"/>
      <path d="M31 46 L32 64 M89 46 L88 64" stroke="#000000" stroke-opacity="0.2" stroke-width="2"/>`,
  },
  gloves: {
    body: [
      '<rect x="36" y="46" width="48" height="46" rx="14"/>',
      '<rect x="37" y="20" width="11" height="40" rx="5.5"/>',
      '<rect x="49" y="12" width="11" height="46" rx="5.5"/>',
      '<rect x="61" y="14" width="11" height="44" rx="5.5"/>',
      '<rect x="73" y="22" width="10" height="38" rx="5"/>',
      '<path d="M84 60 C92 52 100 50 103 55 C106 60 98 70 88 80 Z"/>',
      '<rect x="38" y="86" width="44" height="22" rx="5"/>',
    ],
    front: ({ dark }) => `
      <rect x="38" y="90" width="44" height="12" rx="3" fill="${dark}"/>
      <rect x="40" y="93" width="22" height="6" rx="2" fill="#FFFFFF" fill-opacity="0.25"/>
      <path d="M48 46 L48 58 M60 44 L60 58 M72 46 L72 58" stroke="#000000" stroke-opacity="0.25" stroke-width="1.5"/>
      <path d="M44 70 C56 64 70 64 80 70" fill="none" stroke="#000000" stroke-opacity="0.2" stroke-width="2"/>`,
  },
  shoes: {
    body: ['<path d="M30 16 L60 16 C62 16 63 18 63 20 L64 66 C78 68 94 73 103 81 C109 86 109 94 105 98 L26 98 C22 98 20 95 20 91 L22 24 C22 19 25 16 30 16 Z"/>'],
    front: ({ dark }) => `
      <path d="M20 92 L106 92 C108 96 106 103 101 104 L25 104 C21 104 19 100 20 92 Z" fill="${dark}"/>
      <rect x="22" y="40" width="42" height="9" rx="3" fill="${dark}"/>
      <rect x="52" y="42" width="9" height="5" rx="1.5" fill="#FFFFFF" fill-opacity="0.35"/>
      <path d="M64 70 L70 78 M72 72 L78 80 M80 75 L86 83" stroke="#000000" stroke-opacity="0.3" stroke-width="2.5" stroke-linecap="round"/>
      <rect x="22" y="16" width="41" height="6" rx="3" fill="#000000" fill-opacity="0.2"/>`,
  },
  rib_protector: {
    body: ['<path d="M26 18 L46 18 L50 36 C54 44 66 44 70 36 L74 18 L94 18 L98 28 L98 92 C98 99 93 104 86 104 L34 104 C27 104 22 99 22 92 L22 28 Z"/>'],
    front: ({ dark }) => `
      <path d="M32 56 L50 58 M32 68 L50 70 M32 80 L50 82 M70 58 L88 56 M70 70 L88 68 M70 82 L88 80" stroke="${dark}" stroke-width="4" stroke-linecap="round"/>
      <rect x="54" y="48" width="12" height="52" rx="4" fill="${dark}" fill-opacity="0.6"/>
      <path d="M26 18 L46 18 L50 36 C54 44 66 44 70 36 L74 18 L94 18" fill="none" stroke="${dark}" stroke-width="4" stroke-linejoin="round"/>`,
  },
};

const SLOT_OF = (id) => (id.startsWith('rib-') ? 'rib_protector' : id.split('-')[0]);

// ---------- Livrées (dessinées dans tout le cadre puis découpées par la silhouette) ----------
function pattern(p, { secondary, accent }) {
  switch (p) {
    case 'stripe':
      return `<path d="M44 0 L60 0 L36 120 L20 120 Z" fill="${secondary}"/><path d="M64 0 L70 0 L46 120 L40 120 Z" fill="${accent}"/>`;
    case 'racing':
      return `<rect x="48" y="0" width="8" height="120" fill="${secondary}"/><rect x="62" y="0" width="8" height="120" fill="${secondary}"/>
        <rect x="0" y="62" width="120" height="3" fill="${accent}" fill-opacity="0.6"/>`;
    case 'bolt':
      return `<path d="M70 0 L40 58 L58 58 L38 120 L86 48 L66 48 L86 0 Z" fill="${secondary}"/>
        <path d="M76 6 L50 54 L64 54 L50 100 L78 52 L62 52 Z" fill="${accent}"/>`;
    case 'flame':
      return `<path d="M0 120 L0 70 C10 82 14 62 22 74 C28 54 36 70 40 58 C46 74 52 50 58 66 C64 52 70 70 76 60 C80 76 90 64 94 78 C100 70 108 84 120 76 L120 120 Z" fill="${secondary}"/>
        <path d="M0 120 L0 86 C10 96 16 80 24 90 C30 76 38 90 44 80 C50 92 58 76 64 88 C70 80 78 94 86 86 C92 96 104 88 120 94 L120 120 Z" fill="${accent}"/>`;
    case 'checker': {
      let out = '';
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 15; col++) {
          if ((row + col) % 2 === 0) out += `<rect x="${col * 8}" y="${56 + row * 8}" width="8" height="8" fill="${secondary}"/>`;
        }
      }
      return `${out}<rect x="0" y="80" width="120" height="3" fill="${accent}"/>`;
    }
    case 'carbon': {
      let out = '';
      for (let x = -120; x < 120; x += 6) out += `<path d="M${x} 120 L${x + 120} 0" stroke="${secondary}" stroke-width="2.2"/>`;
      return `${out}<rect x="0" y="70" width="120" height="6" fill="${accent}"/>`;
    }
    case 'worn':
      return `<circle cx="38" cy="40" r="9" fill="${accent}" fill-opacity="0.35"/><circle cx="84" cy="82" r="12" fill="${secondary}" fill-opacity="0.5"/>
        <path d="M26 70 L44 64 M70 30 L86 36" stroke="${secondary}" stroke-width="2" stroke-linecap="round"/>
        <rect x="68" y="76" width="22" height="12" rx="2" fill="#F2F4F7" fill-opacity="0.85"/>`;
    default:
      return '';
  }
}

function svg(id, spec) {
  const shape = SHAPES[SLOT_OF(id)];
  const clip = `clip-${id}`;
  const dark = '#0E0F12';
  const body = shape.body.join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="240" height="240">
  <defs>
    <clipPath id="${clip}">${body}</clipPath>
    <linearGradient id="light-${id}" x1="0" y1="0" x2="0.6" y2="1">
      <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.35"/>
      <stop offset="0.45" stop-color="#FFFFFF" stop-opacity="0"/>
      <stop offset="1" stop-color="#000000" stop-opacity="0.35"/>
    </linearGradient>
  </defs>
  <ellipse cx="60" cy="112" rx="40" ry="5" fill="#000000" fill-opacity="0.35"/>
  <g clip-path="url(#${clip})">
    <rect x="0" y="0" width="120" height="120" fill="${spec.base}"/>
    ${pattern(spec.pattern, spec)}
    <rect x="0" y="0" width="120" height="120" fill="url(#light-${id})"/>
  </g>
  <g fill="none" stroke="#FFFFFF" stroke-opacity="0.22" stroke-width="1.5">${body}</g>
  ${shape.front({ dark })}
</svg>
`;
}

const outDir = join(root, 'assets/gear');
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
for (const [id, spec] of Object.entries(ITEMS)) writeFileSync(join(outDir, `${id}.svg`), svg(id, spec));

const map = Object.keys(ITEMS)
  .map((id) => `  '${id}': require('../../../assets/gear/${id}.svg'),`)
  .join('\n');
writeFileSync(
  join(root, 'src/features/garage/art.ts'),
  `// Fichier généré par scripts/generate-gear-art.mjs — ne pas modifier à la main.
import type { ImageSource } from 'expo-image';

export const gearArt: Record<string, ImageSource> = {
${map}
};
`,
);
console.log(`${Object.keys(ITEMS).length} visuels générés dans assets/gear/`);
