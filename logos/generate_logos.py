import os

svg_dir = "/Users/maxencebastin/Documents/Bloem/EzHoraire/logos"
os.makedirs(svg_dir, exist_ok=True)

# 1. 01-swiss-ez-stacked-exact.svg (Direct translation of the Bauhaus stacked concept)
# E on top, Z on bottom, sharing the middle bar so there is ZERO gap!
svg_01 = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 440" width="100%" height="100%">
  <rect width="320" height="440" fill="#F8F9FA" />
  <g transform="translate(30, 30)">
    <!-- 6 columns x 9 rows grid (cell size: 43.33 x 42.22) -->
    <!-- Grid total width: 260, height: 380 -->
    <!-- Col width = 260/6 = 43.333, Row height = 380/9 = 42.222 -->
    
    <!-- Top 'E': Rows 1 to 4 -->
    <!-- E top bar (blue) -->
    <rect x="43.33" y="42.22" width="173.33" height="42.22" fill="#1D4ED8" />
    <!-- E spine (blue & black) -->
    <rect x="43.33" y="42.22" width="43.33" height="168.88" fill="#1D4ED8" />
    <rect x="65" y="42.22" width="21.66" height="168.88" fill="#18181B" />
    <!-- E middle bar (crimson red) -->
    <rect x="86.66" y="84.44" width="86.66" height="42.22" fill="#E11D48" />
    <!-- E lower bar (blue) -->
    <rect x="86.66" y="126.66" width="130" height="42.22" fill="#1D4ED8" />

    <!-- JUNCTION BAR: Red bar where bottom of E touches top of Z (ZERO GAP) -->
    <rect x="43.33" y="168.88" width="173.33" height="42.22" fill="#E11D48" />

    <!-- Bottom 'Z': Rows 5 to 7 -->
    <!-- Z diagonal (Blue and Black) -->
    <polygon points="173.33,211.11 216.66,211.11 86.66,337.77 43.33,337.77" fill="#18181B" />
    <polygon points="130,211.11 173.33,211.11 43.33,337.77 43.33,295.55" fill="#1D4ED8" />
    <!-- Z bottom base (Black & Blue) -->
    <rect x="43.33" y="295.55" width="43.33" height="42.22" fill="#1D4ED8" />
    <rect x="86.66" y="295.55" width="130" height="42.22" fill="#18181B" />

    <!-- Perfectly closed timetable grid: stops exactly at the bottom border -->
    <rect x="0" y="0" width="260" height="380" fill="none" stroke="#18181B" stroke-width="4" />
    
    <!-- Vertical grid lines -->
    <line x1="43.33" y1="0" x2="43.33" y2="380" stroke="#18181B" stroke-width="2" />
    <line x1="86.66" y1="0" x2="86.66" y2="380" stroke="#18181B" stroke-width="2" />
    <line x1="130" y1="0" x2="130" y2="380" stroke="#18181B" stroke-width="2" />
    <line x1="173.33" y1="0" x2="173.33" y2="380" stroke="#18181B" stroke-width="2" />
    <line x1="216.66" y1="0" x2="216.66" y2="380" stroke="#18181B" stroke-width="2" />
    
    <!-- Horizontal grid lines -->
    <line x1="0" y1="42.22" x2="260" y2="42.22" stroke="#18181B" stroke-width="2" />
    <line x1="0" y1="84.44" x2="260" y2="84.44" stroke="#18181B" stroke-width="2" />
    <line x1="0" y1="126.66" x2="260" y2="126.66" stroke="#18181B" stroke-width="2" />
    <line x1="0" y1="168.88" x2="260" y2="168.88" stroke="#18181B" stroke-width="2" />
    <line x1="0" y1="211.11" x2="260" y2="211.11" stroke="#18181B" stroke-width="2" />
    <line x1="0" y1="253.33" x2="260" y2="253.33" stroke="#18181B" stroke-width="2" />
    <line x1="0" y1="295.55" x2="260" y2="295.55" stroke="#18181B" stroke-width="2" />
    <line x1="0" y1="337.77" x2="260" y2="337.77" stroke="#18181B" stroke-width="2" />
  </g>
</svg>"""

with open(f"{svg_dir}/01-swiss-ez-stacked-exact.svg", "w") as f:
    f.write(svg_01)

# 2. 02-swiss-side-by-side-connected.svg (E & Z side-by-side touching at center)
svg_02 = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 340 340" width="100%" height="100%">
  <rect width="340" height="340" fill="#FFFFFF" />
  <g transform="translate(30, 30)">
    <!-- 4x4 Grid of 70x70 = 280x280 -->
    <!-- E on left (col 0, 1), Z on right (col 2, 3), touching seamlessly across col 1 and 2 -->
    <!-- E top bar -->
    <rect x="0" y="0" width="140" height="70" fill="#2456e0" />
    <!-- E spine -->
    <rect x="0" y="70" width="70" height="140" fill="#2456e0" />
    <!-- E center bar bridging directly into Z diagonal -->
    <rect x="70" y="105" width="105" height="70" fill="#E11D48" />
    
    <!-- Z top bar -->
    <rect x="140" y="0" width="140" height="70" fill="#18181B" />
    <!-- Z diagonal -->
    <polygon points="280,70 210,70 105,210 175,210" fill="#18181B" />
    
    <!-- E base and Z base connecting -->
    <rect x="0" y="210" width="140" height="70" fill="#2456e0" />
    <rect x="140" y="210" width="140" height="70" fill="#E11D48" />

    <!-- Closed Grid lines -->
    <rect x="0" y="0" width="280" height="280" fill="none" stroke="#18181B" stroke-width="4" />
    <line x1="70" y1="0" x2="70" y2="280" stroke="#18181B" stroke-width="2.5" />
    <line x1="140" y1="0" x2="140" y2="280" stroke="#18181B" stroke-width="3" />
    <line x1="210" y1="0" x2="210" y2="280" stroke="#18181B" stroke-width="2.5" />
    
    <line x1="0" y1="70" x2="280" y2="70" stroke="#18181B" stroke-width="2.5" />
    <line x1="0" y1="140" x2="280" y2="140" stroke="#18181B" stroke-width="3" />
    <line x1="0" y1="210" x2="280" y2="210" stroke="#18181B" stroke-width="2.5" />
  </g>
</svg>"""

with open(f"{svg_dir}/02-swiss-side-by-side-connected.svg", "w") as f:
    f.write(svg_02)

# 3. 03-swiss-ez-app-blue.svg
svg_03 = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 340 340" width="100%" height="100%">
  <rect width="340" height="340" fill="#F4F5F7" />
  <g transform="translate(30, 30)">
    <!-- EzHoraire Palette: #2456e0, #0f172a, #8ba6ff, #5fce96 -->
    <!-- E on top rows, Z on bottom, connected through middle accent bar -->
    <rect x="0" y="0" width="140" height="60" fill="#2456e0" />
    <rect x="0" y="60" width="70" height="150" fill="#2456e0" />
    <!-- Center bar touching Z -->
    <rect x="70" y="95" width="120" height="65" fill="#8ba6ff" />
    
    <!-- Z Top bar -->
    <rect x="140" y="0" width="140" height="60" fill="#0f172a" />
    <polygon points="280,60 210,60 90,220 160,220" fill="#0f172a" />
    
    <!-- Base -->
    <rect x="0" y="220" width="140" height="60" fill="#2456e0" />
    <rect x="140" y="220" width="140" height="60" fill="#5fce96" />

    <!-- Closed Grid frame -->
    <rect x="0" y="0" width="280" height="280" fill="none" stroke="#262b34" stroke-width="3.5" />
    <line x1="70" y1="0" x2="70" y2="280" stroke="#262b34" stroke-width="1.5" />
    <line x1="140" y1="0" x2="140" y2="280" stroke="#262b34" stroke-width="2.5" />
    <line x1="210" y1="0" x2="210" y2="280" stroke="#262b34" stroke-width="1.5" />
    
    <line x1="0" y1="70" x2="280" y2="70" stroke="#262b34" stroke-width="1.5" />
    <line x1="0" y1="140" x2="280" y2="140" stroke="#262b34" stroke-width="2.5" />
    <line x1="0" y1="210" x2="280" y2="210" stroke="#262b34" stroke-width="1.5" />
  </g>
</svg>"""

with open(f"{svg_dir}/03-swiss-ez-app-blue.svg", "w") as f:
    f.write(svg_03)

# 4. 04-swiss-continuous-ribbon.svg
svg_04 = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 340 340" width="100%" height="100%">
  <rect width="340" height="340" fill="#FFFFFF" />
  <g transform="translate(30, 30)">
    <rect x="0" y="0" width="280" height="280" fill="#FFFFFF" stroke="#18181B" stroke-width="3" />
    <line x1="70" y1="0" x2="70" y2="280" stroke="#E5E7EB" stroke-width="1.5" />
    <line x1="140" y1="0" x2="140" y2="280" stroke="#18181B" stroke-width="2" />
    <line x1="210" y1="0" x2="210" y2="280" stroke="#E5E7EB" stroke-width="1.5" />
    <line x1="0" y1="70" x2="280" y2="70" stroke="#E5E7EB" stroke-width="1.5" />
    <line x1="0" y1="140" x2="280" y2="140" stroke="#18181B" stroke-width="2" />
    <line x1="0" y1="210" x2="280" y2="210" stroke="#E5E7EB" stroke-width="1.5" />

    <!-- Unbroken Continuous Ribbon: E flows directly into Z -->
    <path d="M 120,40 L 40,40 L 40,240 L 120,240 M 40,140 L 140,140 L 240,40 L 240,240 L 140,240" 
          fill="none" stroke="#2456e0" stroke-width="24" stroke-linecap="square" stroke-linejoin="miter" />
    <path d="M 140,140 L 240,40 L 240,240 L 140,240" 
          fill="none" stroke="#E11D48" stroke-width="24" stroke-linecap="square" stroke-linejoin="miter" />
  </g>
</svg>"""

with open(f"{svg_dir}/04-swiss-continuous-ribbon.svg", "w") as f:
    f.write(svg_04)

# 5. 05-swiss-monochrome-stark.svg
svg_05 = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 340 340" width="100%" height="100%">
  <rect width="340" height="340" fill="#111827" />
  <g transform="translate(30, 30)">
    <!-- White geometric blocks on dark grid -->
    <!-- E Blocks -->
    <rect x="0" y="0" width="140" height="56" fill="#FFFFFF" />
    <rect x="0" y="56" width="56" height="168" fill="#FFFFFF" />
    <rect x="56" y="112" width="124" height="56" fill="#FFFFFF" />
    <rect x="0" y="224" width="140" height="56" fill="#FFFFFF" />

    <!-- Z Blocks seamlessly touching E center bar -->
    <rect x="140" y="0" width="140" height="56" fill="#FFFFFF" />
    <polygon points="280,56 210,56 98,224 168,224" fill="#FFFFFF" />
    <rect x="140" y="224" width="140" height="56" fill="#FFFFFF" />

    <!-- Grid Wireframe -->
    <rect x="0" y="0" width="280" height="280" fill="none" stroke="#374151" stroke-width="2" />
    <line x1="70" y1="0" x2="70" y2="280" stroke="#374151" stroke-width="1.5" />
    <line x1="140" y1="0" x2="140" y2="280" stroke="#374151" stroke-width="2" />
    <line x1="210" y1="0" x2="210" y2="280" stroke="#374151" stroke-width="1.5" />
    <line x1="0" y1="70" x2="280" y2="70" stroke="#374151" stroke-width="1.5" />
    <line x1="0" y1="140" x2="280" y2="140" stroke="#374151" stroke-width="2" />
    <line x1="0" y1="210" x2="280" y2="210" stroke="#374151" stroke-width="1.5" />
  </g>
</svg>"""

with open(f"{svg_dir}/05-swiss-monochrome-stark.svg", "w") as f:
    f.write(svg_05)

# 6. 06-swiss-curves-rhythm.svg
svg_06 = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 340 340" width="100%" height="100%">
  <rect width="340" height="340" fill="#FAF9F6" />
  <g transform="translate(30, 30)">
    <!-- Bauhaus Quarter-circle arcs + geometric blocks -->
    <path d="M 70,0 A 70,70 0 0 0 0,70 L 70,70 Z" fill="#2456e0" />
    <rect x="70" y="0" width="70" height="70" fill="#E11D48" />
    <rect x="140" y="0" width="70" height="70" fill="#FAF9F6" />
    <path d="M 210,0 A 70,70 0 0 1 280,70 L 210,70 Z" fill="#18181B" />

    <rect x="0" y="70" width="70" height="70" fill="#2456e0" />
    <circle cx="105" cy="105" r="22" fill="#F59E0B" />
    <polygon points="210,70 280,70 140,210" fill="#18181B" />

    <!-- Junction touching center -->
    <rect x="0" y="140" width="70" height="70" fill="#E11D48" />
    <rect x="70" y="140" width="70" height="70" fill="#E11D48" />
    <path d="M 140,140 A 70,70 0 0 1 210,210 L 140,210 Z" fill="#2456e0" />
    <rect x="210" y="140" width="70" height="70" fill="#FAF9F6" />

    <path d="M 0,280 A 70,70 0 0 1 70,210 L 70,280 Z" fill="#2456e0" />
    <rect x="70" y="210" width="70" height="70" fill="#2456e0" />
    <rect x="140" y="210" width="70" height="70" fill="#E11D48" />
    <rect x="210" y="210" width="70" height="70" fill="#18181B" />

    <!-- Grid -->
    <rect x="0" y="0" width="280" height="280" fill="none" stroke="#18181B" stroke-width="3.5" />
    <line x1="70" y1="0" x2="70" y2="280" stroke="#18181B" stroke-width="2" />
    <line x1="140" y1="0" x2="140" y2="280" stroke="#18181B" stroke-width="2" />
    <line x1="210" y1="0" x2="210" y2="280" stroke="#18181B" stroke-width="2" />
    <line x1="0" y1="70" x2="280" y2="70" stroke="#18181B" stroke-width="2" />
    <line x1="0" y1="140" x2="280" y2="140" stroke="#18181B" stroke-width="2" />
    <line x1="0" y1="210" x2="280" y2="210" stroke="#18181B" stroke-width="2" />
  </g>
</svg>"""

with open(f"{svg_dir}/06-swiss-curves-rhythm.svg", "w") as f:
    f.write(svg_06)

# 7. 07-swiss-clock-accent.svg
svg_07 = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 340 340" width="100%" height="100%">
  <rect width="340" height="340" fill="#FFFFFF" />
  <g transform="translate(30, 30)">
    <rect x="0" y="0" width="130" height="55" fill="#2456e0" />
    <rect x="0" y="55" width="55" height="170" fill="#2456e0" />
    <rect x="55" y="112" width="105" height="56" fill="#2456e0" />
    <rect x="0" y="225" width="130" height="55" fill="#2456e0" />

    <rect x="150" y="0" width="130" height="55" fill="#18181B" />
    <polygon points="280,55 210,55 120,225 190,225" fill="#18181B" />
    <rect x="150" y="225" width="130" height="55" fill="#E11D48" />

    <!-- Minimalist Watch Dial in Top Slot -->
    <g transform="translate(215, 27.5)">
      <circle cx="0" cy="0" r="16" fill="none" stroke="#FFFFFF" stroke-width="2.5" />
      <line x1="0" y1="0" x2="0" y2="-9" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round" />
      <line x1="0" y1="0" x2="7" y2="0" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round" />
    </g>

    <rect x="0" y="0" width="280" height="280" fill="none" stroke="#18181B" stroke-width="3" />
    <line x1="70" y1="0" x2="70" y2="280" stroke="#E5E7EB" stroke-width="1.5" />
    <line x1="140" y1="0" x2="140" y2="280" stroke="#18181B" stroke-width="2" />
    <line x1="210" y1="0" x2="210" y2="280" stroke="#E5E7EB" stroke-width="1.5" />
    <line x1="0" y1="70" x2="280" y2="70" stroke="#E5E7EB" stroke-width="1.5" />
    <line x1="0" y1="140" x2="280" y2="140" stroke="#18181B" stroke-width="2" />
    <line x1="0" y1="210" x2="280" y2="210" stroke="#E5E7EB" stroke-width="1.5" />
  </g>
</svg>"""

with open(f"{svg_dir}/07-swiss-clock-accent.svg", "w") as f:
    f.write(svg_07)

# 8. 08-swiss-app-icon-squircle.svg
svg_08 = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="100%" height="100%">
  <rect width="512" height="512" rx="115" fill="#101216" />
  <rect x="16" y="16" width="480" height="480" rx="100" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="2" />

  <g transform="translate(106, 106)">
    <rect width="300" height="300" rx="6" fill="#F4F5F7" />

    <rect x="0" y="0" width="150" height="75" fill="#2456e0" />
    <rect x="0" y="75" width="75" height="150" fill="#2456e0" />
    <rect x="75" y="112" width="115" height="75" fill="#E11D48" />
    <rect x="0" y="225" width="150" height="75" fill="#2456e0" />

    <rect x="150" y="0" width="150" height="75" fill="#18181B" />
    <polygon points="300,75 225,75 110,225 185,225" fill="#18181B" />
    <rect x="150" y="225" width="150" height="75" fill="#5FCE96" />

    <rect x="0" y="0" width="300" height="300" rx="6" fill="none" stroke="#18181B" stroke-width="4" />
    <line x1="75" y1="0" x2="75" y2="300" stroke="#18181B" stroke-width="2" />
    <line x1="150" y1="0" x2="150" y2="300" stroke="#18181B" stroke-width="3" />
    <line x1="225" y1="0" x2="225" y2="300" stroke="#18181B" stroke-width="2" />
    
    <line x1="0" y1="75" x2="300" y2="75" stroke="#18181B" stroke-width="2" />
    <line x1="0" y1="150" x2="300" y2="150" stroke="#18181B" stroke-width="3" />
    <line x1="0" y1="225" x2="300" y2="225" stroke="#18181B" stroke-width="2" />
  </g>
</svg>"""

with open(f"{svg_dir}/08-swiss-app-icon-squircle.svg", "w") as f:
    f.write(svg_08)

# 9. 09-swiss-timetable-slots.svg
svg_09 = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 340 340" width="100%" height="100%">
  <rect width="340" height="340" fill="#FFFFFF" />
  <g transform="translate(30, 30)">
    <rect x="0" y="0" width="60" height="280" fill="#2456e0" />
    <rect x="60" y="0" width="80" height="60" fill="#2456e0" />
    <rect x="60" y="110" width="100" height="60" fill="#E11D48" />
    <rect x="60" y="220" width="80" height="60" fill="#2456e0" />

    <rect x="140" y="0" width="140" height="60" fill="#18181B" />
    <polygon points="280,60 200,60 100,220 180,220" fill="#18181B" />
    <rect x="140" y="220" width="140" height="60" fill="#10B981" />

    <rect x="0" y="0" width="280" height="280" fill="none" stroke="#18181B" stroke-width="3.5" />
    <line x1="60" y1="0" x2="60" y2="280" stroke="#18181B" stroke-width="2" />
    <line x1="140" y1="0" x2="140" y2="280" stroke="#18181B" stroke-width="2.5" />
    <line x1="210" y1="0" x2="210" y2="280" stroke="#18181B" stroke-width="2" />
    
    <line x1="0" y1="60" x2="280" y2="60" stroke="#18181B" stroke-width="2" />
    <line x1="0" y1="110" x2="280" y2="110" stroke="#18181B" stroke-width="2" />
    <line x1="0" y1="170" x2="280" y2="170" stroke="#18181B" stroke-width="2" />
    <line x1="0" y1="220" x2="280" y2="220" stroke="#18181B" stroke-width="2" />
  </g>
</svg>"""

with open(f"{svg_dir}/09-swiss-timetable-slots.svg", "w") as f:
    f.write(svg_09)

# 10. 10-swiss-micro-favicon.svg
svg_10 = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="100%" height="100%">
  <rect width="128" height="128" rx="20" fill="#111827" />
  <g transform="translate(18, 18)">
    <path d="M 46,0 L 0,0 L 0,92 L 46,92 M 0,46 L 46,46" 
          fill="none" stroke="#3B82F6" stroke-width="16" stroke-linecap="square" stroke-linejoin="miter" />
    <path d="M 46,0 L 92,0 L 46,92 L 92,92" 
          fill="none" stroke="#EF4444" stroke-width="16" stroke-linecap="square" stroke-linejoin="miter" />
    <line x1="46" y1="46" x2="69" y2="46" stroke="#EF4444" stroke-width="16" stroke-linecap="square" />
  </g>
</svg>"""

with open(f"{svg_dir}/10-swiss-micro-favicon.svg", "w") as f:
    f.write(svg_10)

print("Regenerated 10 refined SVGs successfully.")
