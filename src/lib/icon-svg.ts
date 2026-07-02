/**
 * アプリアイコンの共有デザイン（SVG）。
 * icon.tsx / apple-icon.tsx から ImageResponse 経由で PNG 化される。
 * 配色はアプリ本体のコーラルピンクに合わせている。
 */
export const iconSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#fea3aa"/>
      <stop offset="1" stop-color="#f0616e"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="512" height="512" rx="112" fill="url(#bg)"/>
  <circle cx="256" cy="256" r="150" fill="none" stroke="#ffffff" stroke-width="22"/>
  <g stroke="#ffffff" stroke-width="12" stroke-linecap="round">
    <line x1="256" y1="120" x2="256" y2="144"/>
    <line x1="392" y1="256" x2="368" y2="256"/>
    <line x1="256" y1="392" x2="256" y2="368"/>
    <line x1="120" y1="256" x2="144" y2="256"/>
  </g>
  <rect x="236" y="186" width="40" height="140" rx="14" fill="#ffffff"/>
  <rect x="196" y="236" width="120" height="40" rx="14" fill="#ffffff"/>
  <polyline points="204,256 236,256 250,228 266,284 280,256 308,256"
    fill="none" stroke="#f0616e" stroke-width="10"
    stroke-linecap="round" stroke-linejoin="round"/>
</svg>
`.trim();

export function iconDataUri(): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(iconSvg)}`;
}
