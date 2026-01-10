# ProtocolHub Design Guidelines

## Design Approach
**Cyberpunk Terminal Aesthetic** - Drawing from crypto trading platforms (Dexscreener, Birdeye), terminal interfaces, and sci-fi UI design. This is a data-heavy, utility-focused application where form follows function but with aggressive cyberpunk styling.

## Core Design Elements

### Typography
- **Primary Font**: JetBrains Mono (Google Fonts) - monospace for terminal aesthetic
- **Hierarchy**: 
  - Headers: 24-32px, font-bold, uppercase tracking-wider
  - Data values: 16-20px, font-medium, tabular-nums
  - Labels: 12-14px, font-normal, text-cyan-400/70
  - Terminal output: 14px, font-mono

### Layout System
**Tailwind spacing primitives**: 2, 4, 6, 8 units (gaps, padding)
- Grid-based dashboard using `grid-cols-12` for flexible panel layouts
- Full viewport height (h-screen) with fixed header
- Panels use `gap-4` or `gap-6` between elements
- Internal padding: `p-4` to `p-6` for cards/panels

### Color Palette
- **Backgrounds**: slate-950, slate-900, slate-800 (layered depth)
- **Accent**: cyan-400, cyan-500 (neon glow effect)
- **Data visualization**: cyan-400, emerald-400 (positive), rose-400 (negative), amber-400 (warning)
- **Borders**: cyan-500/30 with glow via `shadow-[0_0_15px_rgba(34,211,238,0.3)]`
- **Text**: slate-100 (primary), cyan-400 (interactive), slate-400 (secondary)

## Component Library

### Navigation
**Fixed Top Bar** (h-16):
- Dark background (bg-slate-900/95 backdrop-blur-sm)
- Logo left, terminal status indicators center, wallet connect right
- Subtle cyan bottom border with glow
- Monospace uppercase navigation items

### Data Panels
**Terminal Cards**:
- Background: bg-slate-900/50 with backdrop-blur
- Border: border border-cyan-500/30 with neon glow shadow
- Corner accent: Small cyan-500 diagonal cut (CSS clip-path or border trick)
- Header bar: bg-slate-800/80, cyan-400 text, includes timestamp
- Scrollable content area for live feeds

### Dashboard Grid Layout
```
Desktop: 3-column main grid (2-6-4 ratio)
- Left sidebar: Wallet quick stats (col-span-2)
- Center: Main terminal feed (col-span-6)
- Right sidebar: Priority fees & alerts (col-span-4)

Tablet: 2-column (6-6)
Mobile: Single column (stacked)
```

### Data Tables
- Alternating row bg: bg-slate-800/30
- Header: bg-slate-800, sticky top, cyan-400 text
- Borders: border-slate-700/50
- Hover state: bg-cyan-500/10
- Monospace numerals with color coding (green up, red down)

### Live Feed Items
- Compact cards (h-20) with border-l-2 border-cyan-500
- Icon + data type + value + timestamp layout
- Fade-in animation for new entries (animate-pulse once)
- Background glow on high-value trades

### Input Fields
- Dark input: bg-slate-800 border-cyan-500/30
- Focus: ring-2 ring-cyan-500/50 with glow
- Placeholder: text-slate-500
- Monospace font

### Buttons
**Primary**: bg-cyan-500 text-slate-950 hover:bg-cyan-400 with subtle glow
**Secondary**: border-cyan-500 text-cyan-400 hover:bg-cyan-500/10
**Danger**: border-rose-500 text-rose-400
All buttons: uppercase, tracking-wide, px-6 py-3

## Visual Effects
- Scanline overlay: Subtle repeating gradient on main viewport
- Data pulse: Animate-pulse on live updating values
- Glow effects: box-shadow with cyan rgba values on borders/accents
- Grid background: Faint cyan grid pattern on main background (CSS background-image)

## Images
**No hero image needed** - This is a terminal/dashboard, not a landing page. Focus is purely on data visualization and functional UI.

**Icons**: Use Heroicons (via CDN) for:
- Wallet icons, chart indicators, alert symbols
- Status indicators (online/offline dots)
- Transaction type icons (swap, transfer, stake)

## Dashboard Sections
1. **Header Bar**: Logo, network status, wallet connection
2. **Quick Stats Bar**: TVL, active wallets, network fees (horizontal cards)
3. **Main Grid**: 
   - Whale Trade Feed (center, dominant)
   - Wallet Intelligence Panel (left)
   - Priority Fee Monitor (right)
   - MEV Protection Status (bottom strip)
4. **Footer Terminal**: Command input for advanced users (sticky bottom)

## Animations
Minimal, functional only:
- Number counting animations for value updates
- Pulse on new trade entries (once)
- Smooth scrolling for feeds
- NO decorative animations

**Critical**: Every panel must feel like a working terminal with live data, readable at a glance, with aggressive cyberpunk aesthetic through color, glow effects, and monospace typography.