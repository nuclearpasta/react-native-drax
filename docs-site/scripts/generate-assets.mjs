import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const staticImg = join(__dirname, '..', 'static', 'img');

// Social card: 1200x630
const socialCardSvg = `
<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1200" y2="630" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#0c0c0e"/>
      <stop offset="100%" stop-color="#17171a"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="200" y2="200" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#cf5f34"/>
      <stop offset="100%" stop-color="#e67e3d"/>
    </linearGradient>
  </defs>

  <!-- Background -->
  <rect width="1200" height="630" fill="url(#bg)"/>

  <!-- Subtle grid pattern -->
  <g opacity="0.06">
    ${Array.from({ length: 26 }, (_, i) => `<line x1="${i * 48}" y1="0" x2="${i * 48}" y2="630" stroke="#f5f5f0" stroke-width="1"/>`).join('\n    ')}
    ${Array.from({ length: 14 }, (_, i) => `<line x1="0" y1="${i * 48}" x2="1200" y2="${i * 48}" stroke="#f5f5f0" stroke-width="1"/>`).join('\n    ')}
  </g>

  <!-- Logo mark (scaled up) -->
  <g transform="translate(80, 80)">
    <rect width="72" height="72" rx="14" fill="#cf5f34"/>
    <path d="M21.6 25.2h28.8v5.4H21.6zM21.6 34.2h28.8v5.4H21.6zM21.6 43.2h28.8v5.4H21.6z" fill="white" opacity="0.9"/>
    <path d="M50.4 19.8l7.2 7.2-7.2 7.2" stroke="white" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/>
  </g>

  <!-- Title -->
  <text x="80" y="230" font-family="system-ui, -apple-system, sans-serif" font-size="72" font-weight="700" fill="#f5f5f0" letter-spacing="-3">react-native-drax</text>

  <!-- Tagline -->
  <text x="80" y="300" font-family="system-ui, -apple-system, sans-serif" font-size="36" font-weight="400" fill="#afafa8">Drag-and-drop for React Native.</text>
  <text x="80" y="345" font-family="system-ui, -apple-system, sans-serif" font-size="36" font-weight="600" fill="#cf5f34">Done right.</text>

  <!-- Feature pills -->
  <g transform="translate(80, 400)">
    <rect x="0" y="0" width="180" height="44" rx="22" fill="none" stroke="#f5f5f0" stroke-opacity="0.15" stroke-width="1.5"/>
    <text x="90" y="28" font-family="monospace" font-size="16" fill="#afafa8" text-anchor="middle">Sortable Lists</text>

    <rect x="196" y="0" width="220" height="44" rx="22" fill="none" stroke="#f5f5f0" stroke-opacity="0.15" stroke-width="1.5"/>
    <text x="306" y="28" font-family="monospace" font-size="16" fill="#afafa8" text-anchor="middle">Cross-Container</text>

    <rect x="432" y="0" width="180" height="44" rx="22" fill="none" stroke="#f5f5f0" stroke-opacity="0.15" stroke-width="1.5"/>
    <text x="522" y="28" font-family="monospace" font-size="16" fill="#afafa8" text-anchor="middle">Drag Handles</text>

    <rect x="628" y="0" width="190" height="44" rx="22" fill="none" stroke="#f5f5f0" stroke-opacity="0.15" stroke-width="1.5"/>
    <text x="723" y="28" font-family="monospace" font-size="16" fill="#afafa8" text-anchor="middle">UI-Thread First</text>
  </g>

  <!-- Platforms -->
  <g transform="translate(80, 480)">
    <text font-family="monospace" font-size="14" fill="#5d5d5d" letter-spacing="2">iOS · Android · Web</text>
  </g>

  <!-- Bottom accent line -->
  <rect x="0" y="620" width="1200" height="10" fill="url(#accent)"/>

  <!-- NuclearPasta branding -->
  <text x="1120" y="580" font-family="monospace" font-size="14" fill="#5d5d5d" text-anchor="end">nuclearpasta.com</text>
</svg>`;

// Favicon: 32x32 (use the logo)
const faviconSvg = `
<svg width="32" height="32" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
  <rect width="40" height="40" rx="8" fill="#cf5f34"/>
  <path d="M12 14h16v3H12zM12 19h16v3H12zM12 24h16v3H12z" fill="white" opacity="0.9"/>
  <path d="M28 11l4 4-4 4" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

// Generate social card PNG
await sharp(Buffer.from(socialCardSvg))
  .resize(1200, 630)
  .png()
  .toFile(join(staticImg, 'social-card.png'));

console.log('Generated social-card.png (1200x630)');

// Generate multiple sizes for favicon
const sizes = [16, 32, 48];
for (const size of sizes) {
  await sharp(Buffer.from(faviconSvg))
    .resize(size, size)
    .png()
    .toFile(join(staticImg, `favicon-${size}.png`));
}

// Generate a 180x180 apple-touch-icon
await sharp(Buffer.from(faviconSvg))
  .resize(180, 180)
  .png()
  .toFile(join(staticImg, 'apple-touch-icon.png'));

console.log('Generated favicon files');

// Also generate a social card for the example app
const exampleSocialCardSvg = `
<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg2" x1="0" y1="0" x2="1200" y2="630" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#0c0c0e"/>
      <stop offset="100%" stop-color="#17171a"/>
    </linearGradient>
    <linearGradient id="accent2" x1="0" y1="0" x2="200" y2="200" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#cf5f34"/>
      <stop offset="100%" stop-color="#e67e3d"/>
    </linearGradient>
  </defs>

  <rect width="1200" height="630" fill="url(#bg2)"/>

  <g opacity="0.06">
    ${Array.from({ length: 26 }, (_, i) => `<line x1="${i * 48}" y1="0" x2="${i * 48}" y2="630" stroke="#f5f5f0" stroke-width="1"/>`).join('\n    ')}
    ${Array.from({ length: 14 }, (_, i) => `<line x1="0" y1="${i * 48}" x2="1200" y2="${i * 48}" stroke="#f5f5f0" stroke-width="1"/>`).join('\n    ')}
  </g>

  <g transform="translate(80, 80)">
    <rect width="72" height="72" rx="14" fill="#cf5f34"/>
    <path d="M21.6 25.2h28.8v5.4H21.6zM21.6 34.2h28.8v5.4H21.6zM21.6 43.2h28.8v5.4H21.6z" fill="white" opacity="0.9"/>
    <path d="M50.4 19.8l7.2 7.2-7.2 7.2" stroke="white" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/>
  </g>

  <text x="80" y="230" font-family="system-ui, -apple-system, sans-serif" font-size="72" font-weight="700" fill="#f5f5f0" letter-spacing="-3">Live Demo</text>

  <text x="80" y="300" font-family="system-ui, -apple-system, sans-serif" font-size="36" font-weight="400" fill="#afafa8">Interactive drag-and-drop examples</text>
  <text x="80" y="345" font-family="system-ui, -apple-system, sans-serif" font-size="36" font-weight="400" fill="#afafa8">running in your browser.</text>

  <g transform="translate(80, 400)">
    <rect x="0" y="0" width="160" height="44" rx="22" fill="none" stroke="#f5f5f0" stroke-opacity="0.15" stroke-width="1.5"/>
    <text x="80" y="28" font-family="monospace" font-size="16" fill="#afafa8" text-anchor="middle">Color Drag</text>

    <rect x="176" y="0" width="180" height="44" rx="22" fill="none" stroke="#f5f5f0" stroke-opacity="0.15" stroke-width="1.5"/>
    <text x="266" y="28" font-family="monospace" font-size="16" fill="#afafa8" text-anchor="middle">Sortable Lists</text>

    <rect x="372" y="0" width="200" height="44" rx="22" fill="none" stroke="#f5f5f0" stroke-opacity="0.15" stroke-width="1.5"/>
    <text x="472" y="28" font-family="monospace" font-size="16" fill="#afafa8" text-anchor="middle">Cross-List</text>

    <rect x="588" y="0" width="180" height="44" rx="22" fill="none" stroke="#f5f5f0" stroke-opacity="0.15" stroke-width="1.5"/>
    <text x="678" y="28" font-family="monospace" font-size="16" fill="#afafa8" text-anchor="middle">Knight Moves</text>
  </g>

  <g transform="translate(80, 480)">
    <text font-family="monospace" font-size="14" fill="#cf5f34" letter-spacing="1">react-native-drax</text>
  </g>

  <rect x="0" y="620" width="1200" height="10" fill="url(#accent2)"/>

  <text x="1120" y="580" font-family="monospace" font-size="14" fill="#5d5d5d" text-anchor="end">nuclearpasta.com</text>
</svg>`;

// Save example social card to example/public (served as-is by Expo static export)
const examplePublic = join(__dirname, '..', '..', 'example', 'public');
await sharp(Buffer.from(exampleSocialCardSvg))
  .resize(1200, 630)
  .png()
  .toFile(join(examplePublic, 'social-card.png'));

console.log('Generated example social-card.png (1200x630)');

// ── Example app icons (replace Expo defaults — these stay in assets/) ──
const exampleAssets = join(__dirname, '..', '..', 'example', 'assets');

const logoSvg = `
<svg width="400" height="400" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
  <rect width="40" height="40" rx="8" fill="#cf5f34"/>
  <path d="M12 14h16v3H12zM12 19h16v3H12zM12 24h16v3H12z" fill="white" opacity="0.9"/>
  <path d="M28 11l4 4-4 4" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

// icon.png — 1024x1024 (app icon)
await sharp(Buffer.from(logoSvg))
  .resize(1024, 1024)
  .png()
  .toFile(join(exampleAssets, 'icon.png'));

// adaptive-icon.png — 1024x1024 (Android adaptive foreground)
await sharp(Buffer.from(logoSvg))
  .resize(1024, 1024)
  .png()
  .toFile(join(exampleAssets, 'adaptive-icon.png'));

// favicon.png — 48x48 (web favicon)
await sharp(Buffer.from(logoSvg))
  .resize(48, 48)
  .png()
  .toFile(join(exampleAssets, 'favicon.png'));

// splash-icon.png — 200x200 (splash screen logo)
await sharp(Buffer.from(logoSvg))
  .resize(200, 200)
  .png()
  .toFile(join(exampleAssets, 'splash-icon.png'));

console.log('Generated example app icons (icon, adaptive-icon, favicon, splash-icon)');
