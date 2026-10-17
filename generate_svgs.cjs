const fs = require('fs');
const path = require('path');

// 1. Icon Emblem SVG
const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="100%" height="100%">
  <defs>
    <linearGradient id="goldMain" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FFF8E7"/>
      <stop offset="20%" stop-color="#F3D899"/>
      <stop offset="45%" stop-color="#D4A754"/>
      <stop offset="70%" stop-color="#F0D18C"/>
      <stop offset="90%" stop-color="#B88A38"/>
      <stop offset="100%" stop-color="#8F6320"/>
    </linearGradient>
    <linearGradient id="goldLight" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#D4A754"/>
      <stop offset="40%" stop-color="#FFFDF7"/>
      <stop offset="70%" stop-color="#ECC67B"/>
      <stop offset="100%" stop-color="#B88A38"/>
    </linearGradient>
    <radialGradient id="centerGlow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#ECC67B" stop-opacity="0.35"/>
      <stop offset="60%" stop-color="#D4A754" stop-opacity="0.1"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
    </radialGradient>
    <filter id="softGlow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="3" result="blur"/>
      <feComposite in="SourceGraphic" in2="blur" operator="over"/>
    </filter>
  </defs>

  <!-- Ambient Glow -->
  <circle cx="100" cy="100" r="92" fill="url(#centerGlow)"/>

  <!-- Outer Double Ring -->
  <circle cx="100" cy="100" r="88" fill="none" stroke="url(#goldMain)" stroke-width="2.5"/>
  <circle cx="100" cy="100" r="82" fill="none" stroke="url(#goldLight)" stroke-width="1" stroke-dasharray="3 4" opacity="0.75"/>
  <circle cx="100" cy="100" r="76" fill="none" stroke="url(#goldMain)" stroke-width="0.75" opacity="0.5"/>

  <!-- Cardinal Accents (Diamonds) -->
  <polygon points="100,6 103,12 100,18 97,12" fill="url(#goldLight)"/>
  <polygon points="100,182 103,188 100,194 97,188" fill="url(#goldLight)"/>
  <polygon points="6,100 12,97 18,100 12,103" fill="url(#goldLight)"/>
  <polygon points="182,100 188,97 194,100 188,103" fill="url(#goldLight)"/>

  <!-- Corner Accent Dots -->
  <circle cx="38" cy="38" r="2" fill="url(#goldLight)" opacity="0.8"/>
  <circle cx="162" cy="38" r="2" fill="url(#goldLight)" opacity="0.8"/>
  <circle cx="38" cy="162" r="2" fill="url(#goldLight)" opacity="0.8"/>
  <circle cx="162" cy="162" r="2" fill="url(#goldLight)" opacity="0.8"/>

  <!-- Central Luxury "M" Monogram -->
  <g id="monogram" filter="url(#softGlow)">
    <!-- Crown Diamond Star Apex -->
    <path d="M100,32 L103.5,44 L115.5,47.5 L103.5,51 L100,63 L96.5,51 L84.5,47.5 L96.5,44 Z" fill="url(#goldLight)"/>
    <circle cx="100" cy="47.5" r="2" fill="#FFFFFF"/>

    <!-- Left Pillar Column with Serifs -->
    <!-- Top Serif Left -->
    <path d="M42,68 L60,68 L60,73 L55,73 L55,140 L60,140 L60,145 L42,145 L42,140 L47,140 L47,73 L42,73 Z" fill="url(#goldMain)"/>
    <path d="M47,73 L51,73 L51,140 L47,140 Z" fill="url(#goldLight)" opacity="0.7"/>

    <!-- Right Pillar Column with Serifs -->
    <!-- Top Serif Right -->
    <path d="M140,68 L158,68 L158,73 L153,73 L153,140 L158,140 L158,145 L140,145 L140,140 L145,140 L145,73 L140,73 Z" fill="url(#goldMain)"/>
    <path d="M149,73 L153,73 L153,140 L149,140 Z" fill="url(#goldLight)" opacity="0.7"/>

    <!-- Left Diagonal Chevron -->
    <polygon points="55,73 66,73 100,128 89,128" fill="url(#goldMain)"/>
    <polygon points="63,73 66,73 100,128 97,128" fill="url(#goldLight)" opacity="0.8"/>

    <!-- Right Diagonal Chevron -->
    <polygon points="145,73 134,73 100,128 111,128" fill="url(#goldMain)"/>
    <polygon points="137,73 134,73 100,128 103,128" fill="#B88A38" opacity="0.9"/>

    <!-- Center Pinnacle Arch / Core Crest -->
    <path d="M92,126 Q100,112 100,88 Q100,112 108,126 L100,138 Z" fill="url(#goldLight)"/>
    
    <!-- Base Center Gem Accent -->
    <polygon points="100,146 104,152 100,158 96,152" fill="url(#goldLight)"/>
  </g>
</svg>`;

// 2. Full Horizontal Logo SVG (Icon + Typography)
const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 340 68" width="100%" height="100%">
  <defs>
    <linearGradient id="logoGold" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FFFDF5"/>
      <stop offset="25%" stop-color="#F5DC9E"/>
      <stop offset="50%" stop-color="#D8AA54"/>
      <stop offset="75%" stop-color="#F2D38B"/>
      <stop offset="100%" stop-color="#B3822E"/>
    </linearGradient>
    <linearGradient id="logoText" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#FFFFFF"/>
      <stop offset="40%" stop-color="#FFF5DE"/>
      <stop offset="70%" stop-color="#F2DBA5"/>
      <stop offset="100%" stop-color="#E5C275"/>
    </linearGradient>
    <linearGradient id="subLine" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#D8AA54" stop-opacity="0"/>
      <stop offset="50%" stop-color="#D8AA54" stop-opacity="0.8"/>
      <stop offset="100%" stop-color="#D8AA54" stop-opacity="0"/>
    </linearGradient>
    <filter id="logoGlow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="2" result="blur"/>
      <feComposite in="SourceGraphic" in2="blur" operator="over"/>
    </filter>
  </defs>

  <!-- Left Icon Emblem (56x56 scaled) -->
  <g transform="translate(6, 6) scale(0.28)">
    <!-- Ambient Glow -->
    <circle cx="100" cy="100" r="92" fill="#ECC67B" fill-opacity="0.25"/>

    <!-- Outer Double Ring -->
    <circle cx="100" cy="100" r="88" fill="none" stroke="url(#logoGold)" stroke-width="3"/>
    <circle cx="100" cy="100" r="82" fill="none" stroke="url(#logoGold)" stroke-width="1.2" stroke-dasharray="3 4" opacity="0.8"/>

    <!-- Cardinal Accents -->
    <polygon points="100,6 103,12 100,18 97,12" fill="url(#logoGold)"/>
    <polygon points="100,182 103,188 100,194 97,188" fill="url(#logoGold)"/>
    <polygon points="6,100 12,97 18,100 12,103" fill="url(#logoGold)"/>
    <polygon points="182,100 188,97 194,100 188,103" fill="url(#logoGold)"/>

    <!-- Monogram M -->
    <g filter="url(#logoGlow)">
      <!-- Star Apex -->
      <path d="M100,32 L103.5,44 L115.5,47.5 L103.5,51 L100,63 L96.5,51 L84.5,47.5 L96.5,44 Z" fill="url(#logoGold)"/>
      <circle cx="100" cy="47.5" r="2.5" fill="#FFFFFF"/>

      <!-- Pillars -->
      <path d="M42,68 L60,68 L60,73 L55,73 L55,140 L60,140 L60,145 L42,145 L42,140 L47,140 L47,73 L42,73 Z" fill="url(#logoGold)"/>
      <path d="M140,68 L158,68 L158,73 L153,73 L153,140 L158,140 L158,145 L140,145 L140,140 L145,140 L145,73 L140,73 Z" fill="url(#logoGold)"/>

      <!-- Chevrons -->
      <polygon points="55,73 66,73 100,128 89,128" fill="url(#logoGold)"/>
      <polygon points="145,73 134,73 100,128 111,128" fill="url(#logoGold)"/>

      <!-- Center Arch & Gem -->
      <path d="M92,126 Q100,112 100,88 Q100,112 108,126 L100,138 Z" fill="#FFF5DE"/>
      <polygon points="100,146 104,152 100,158 96,152" fill="url(#logoGold)"/>
    </g>
  </g>

  <!-- Brand Typography -->
  <!-- Main Name: METRROMA -->
  <text x="74" y="40"
        font-family="'Playfair Display', 'Cormorant Garamond', 'Cinzel', 'Times New Roman', Georgia, serif"
        font-size="28"
        font-weight="700"
        letter-spacing="0.24em"
        fill="url(#logoText)">METRROMA</text>

  <!-- Subtitle with side lines -->
  <line x1="75" y1="52" x2="116" y2="52" stroke="url(#subLine)" stroke-width="1"/>
  
  <text x="122" y="55"
        font-family="'Inter', 'Montserrat', -apple-system, sans-serif"
        font-size="8"
        font-weight="600"
        letter-spacing="0.32em"
        fill="#D8AA54">LUXURY ESSENTIALS</text>
        
  <line x1="284" y1="52" x2="325" y2="52" stroke="url(#subLine)" stroke-width="1"/>
</svg>`;

// Destination directories
const dirs = [
  'C:/Users/sHaKiL/antigravity/metromaa-repo/uploads',
  'C:/Users/sHaKiL/antigravity/metromaa-repo/web/dist/uploads',
  'C:/Users/sHaKiL/antigravity/Body-Touch/dot-store/uploads',
  'C:/Users/sHaKiL/antigravity/Body-Touch/dot-store/web/dist/uploads'
];

dirs.forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, 'logo_metrroma.svg'), logoSvg, 'utf8');
  fs.writeFileSync(path.join(d, 'icon_metrroma.svg'), iconSvg, 'utf8');
  fs.writeFileSync(path.join(d, 'favicon_metrroma.svg'), iconSvg, 'utf8');
});

console.log('✅ Generated logo_metrroma.svg and icon_metrroma.svg across all upload directories.');
