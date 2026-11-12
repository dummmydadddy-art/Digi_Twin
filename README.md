# Digi_Twin (Body Twin 3D)

> **Educational 3D Human Anatomy & Physiologically-Grounded Pharmacokinetic Simulation**  
> Built with Vite, TypeScript, React 19, and Three.js (r159). Forked and evolved from [ashemag/human-atlas](https://github.com/ashemag/human-atlas) with [BodyParts3D](https://dbarchive.biosciencedbc.jp/en/bodyparts3d/) anatomical geometry (CC BY 4.0).

---

## Overview

**Digi_Twin** is an interactive, browser-based 3D digital human twin that pairs full-body macroscopic anatomy with a rigorous 5-compartment pharmacokinetic (PK) simulation engine. Users can orbit, peel layers, inspect internal organs via clipping-plane cutaways, scale patient morphology, and simulate the complete oral absorption, distribution, hepatic metabolism, and renal clearance of common active pharmaceutical ingredients in real time.

All computation runs **100% client-side** using a Web Worker and pure TypeScript ODE numerical solvers — requiring zero server backend, no paid APIs, and no credentials.

---

## Key Features

### 1. High-Performance 3D Anatomy Engine
- **2,234 Individually Pickable Meshes & 3,432 Named Concepts**: Powered by BodyParts3D adult male reference geometry.
- **Batched Geometry Rendering**: Geometry sharing the same anatomical system is dynamically merged, reducing draw calls from 2,234 to **~15–20 per frame** for rock-solid 60 FPS.
- **Layer Peeling Dock**: Smoothly peel through anatomical strata from **Skin (0%) → Muscles → Skeleton → Organs (80%+)** via screen-door dithering and GPU data textures.
- **Interactive 360° Orbit & Focus**: Click-to-focus on any organ with smooth camera dolly and waist-centered orbit pivot.

### 2. Organ Clipping Cutaway & Honest Physiological Motion
- **Dynamic Cross-Sectional Shader**: Slice through organs with an interactive clipping plane featuring a colored interior cap (`vec3(0.85, 0.38, 0.32)`), giving immediate visual depth.
- **Honest Physiological Motion**: Vertex shader animations simulating rhythmic heartbeat (72 bpm), lung expansion (14 bpm), and intestinal peristalsis waves.
- **Clinical Dossier Cards**: Detailed cards showing physiological function, anatomical location, and clinical facts, with explicit notices when an organ utilizes surface-only representation.

### 3. Patient Profile & Morphological Body Scaling
- **Custom Patient Attributes**: Configure age (18–90y), biological sex (gracile frame adjustments), height (135–210 cm), weight (40–140 kg), blood group, and documented drug allergies.
- **Dynamic Mesh Scaling**:
  - Height scales along the Y-axis.
  - Weight scales torso and abdominal girth along the X and Z axes based on BMI ($0.70\times$ to $1.45\times$ sensible clamps).
- **Derived PK Metrics**: Real-time calculation of BMI, Mosteller Body Surface Area (BSA), Watson Total Body Water (TBW), and Cockcroft-Gault Creatinine Clearance (eCrCl).

### 4. Pure TypeScript Pharmacokinetics (PK) Engine
- **5-Compartment Runge-Kutta (RK4) Solver**:
  - Stomach ($A_{\text{stomach}}$), Gut ($A_{\text{gut}}$), Systemic Plasma ($A_{\text{plasma}}$), Liver ($A_{\text{liver}}$), Kidney ($A_{\text{kidney}}$).
  - First-order gastric emptying ($k_{\text{empty}}$), intestinal carrier absorption ($k_a$), oral bioavailability ($F$), volume of distribution ($V_d$ per kg), hepatic clearance ($CL_h$), and renal clearance ($CL_r$).
  - **Guaranteed Mass Conservation**: Numerical drift $\Delta \sum A_i < 0.0001\%$ over 24 simulated hours.
- **Sourced Drug Database (`src/pk/drugs.json`)**:
  - **Paracetamol (500mg, 650mg, 1000mg)**: Prescott LF (1980). Predominantly hepatic ($>90\%$).
  - **Ibuprofen (200mg, 400mg, 800mg)**: Davies NM (1998). High protein binding, small $V_d$.
  - **Aspirin (81mg, 325mg, 500mg)**: Rowland M (1968). Rapid gastric/intestinal hydrolysis.
  - **Amoxicillin (250mg, 500mg, 875mg)**: Sjövall J (1985). Predominantly renal ($>75\%$).
- **Clinical Safety Module**:
  - Allergy contraindication lock: blocks swallow and warns if patient has matching hypersensitivity (e.g., Penicillin allergy blocks Amoxicillin; NSAID allergy blocks Ibuprofen/Aspirin).
  - Per-kg single-dose warnings based on patient body weight.
- **18/18 Passing Unit Tests**: Validating mass conservation, peak windows ($T_{\max}$, $C_{\max}$), organ elimination routes, and safety gates.

### 5. Connected 3D Digestion Simulation
- **Actual-Mesh Centred Catmull-Rom Spline**: 22 anatomical waypoints sampled directly from mesh bounding boxes: Oral cavity (`FJ2761`), Esophagus (`FJ2563`), Stomach (`FJ2564`), Duodenum (`FJ2573`), Jejunum (`FJ2606`–`FJ2615`), and Ileum (`FJ2574`–`FJ2585`).
- **240 Instanced Molecule Particles**: Flow along the centreline spline with molecular density partitioned strictly by compartment amounts ($A_{\text{stomach}}$ in electric blue `#38bdf8`, $A_{\text{gut}}$ in warm amber `#fbbf24`, $A_{\text{plasma}}$ capillary flush `#f43f5e`).
- **Instantaneous Clearance Rate Glow**:
  - Liver glows golden-amber proportional to hepatic rate: $\text{Rate}_h = C_p \cdot CL_h$.
  - Kidneys illuminate in vibrant cyan proportional to renal rate: $\text{Rate}_r = C_p \cdot CL_r$.
- **Time-Speed Controls**: $1\times$ to $600\times$ playback slider and presets (`1x`, `10x`, `60x`, `120x`, `300x`, `600x`), with instant Pause and Reset.
- **Live Bateman Concentration Chart (`#chart`)**: Plots 24-hour plasma curve with therapeutic window, MEC threshold, and toxic boundary.

### 6. Performance & Progressive Streaming
- **Rolldown Code-Splitting**: Monolithic bundle cut by **69.4%** (main entry down from 984 kB to **301 kB**).
- **Progressive Organ Lazy Loading**: Initial critical set (`[10, 11, 0]`, ~6 MB) renders First Meaningful Paint in **< 400 ms**; remaining 12 chunks stream during idle frames with zero UI stutter.
- **Mobile Viewport Optimization**: Full responsive design tested on 390 × 844 iPhone profile with 44px touch targets.

---

## Architecture & Codebase Layout

```
Digi_Twin/
├── app/                           # Core application logic & UI
│   ├── page.tsx                   # Main React page: UI layout, sheets, modals
│   ├── scene.tsx                  # Three.js WebGL canvas, OrbitControls, shader materials
│   ├── anatomy.ts                 # Data models: 15 anatomical systems, Concepts, scaling logic
│   ├── explosion-layout.ts        # 2D/3D unpacked inventory calculator
│   ├── model-download.ts          # Mesh chunk decoder & DecompressionStream streaming
│   ├── pointer-tap.ts             # Pointer movement & tap-vs-drag threshold detector
│   └── globals.css                # Tailwind CSS v4 design tokens, glassmorphism, responsive styles
├── src/pk/                        # Pure TypeScript Pharmacokinetics Engine
│   ├── types.ts                   # Strongly typed PK parameters, states, and safety types
│   ├── engine.ts                  # 5-compartment RK4 differential equation solver
│   ├── safety.ts                  # Allergy validation and weight-based dose warnings
│   ├── drugs.json                 # Sourced active ingredients with literature citations
│   ├── worker.ts                  # Dedicated Web Worker for off-thread simulation
│   ├── worker-client.ts           # Web Worker RPC client with synchronous fallback
│   └── __tests__/                 # Comprehensive Node.js native test suite
│       └── pk.test.ts             # 18 mass conservation, peak range, and safety tests
├── public/
│   ├── models/                    # Binary mesh chunks (body-0.bin.gz .. body-14.bin.gz)
│   │   └── atlas.json             # Geometry manifest: 2,234 parts, byte offsets, bounds
│   └── ATTRIBUTION.md             # Dataset licensing & citations
├── vercel.json                    # Static deployment headers, immutable caching, and SPA rewrites
├── vite.config.ts                 # Vite bundler configuration & Rolldown code-splitting
└── PROJECT.md                     # Detailed development milestone tracker & architecture notes
```

---

## Getting Started

### Prerequisites
- Node.js 22.13 or newer
- npm 10+

### Installation & Run

```bash
# Clone the repository
git clone https://github.com/dummmydadddy-art/Digi_Twin.git
cd Digi_Twin

# Install dependencies
npm ci

# Start local development server
npm run dev
```

Open `http://localhost:3016` in your browser.

### Quality Assurance & Validation

```bash
# Run TypeScript typecheck
npm run check

# Run pharmacokinetic unit test suite (18 tests)
npm test

# Build production bundle (dist/)
npm run build
```

---

## Dataset Licensing & Attribution

- **BodyParts3D**: © *The Database Center for Life Science (DBCLS)*, Research Organization of Information and Systems (ROIS), Japan. Licensed under [Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/).
  - Publication: Mitsuhashi N, et al. *BodyParts3D: 3D structure database for anatomical concepts.* Nucleic Acids Res. 2009;37:D782-5. [doi:10.1093/nar/gkn613](https://doi.org/10.1093/nar/gkn613).
- **Human Atlas Architecture**: Open-source 3D anatomy viewer architecture created by Ashish Shekar ([ashemag/human-atlas](https://github.com/ashemag/human-atlas), MIT License).
- **Three.js**: WebGL 3D graphics library (MIT License).
- **meshoptimizer**: Mesh compression and vertex decoding (MIT License, Arseny Kapoulkine).

---

## Clinical Disclaimer

> **Educational Demonstration Only**: Body Twin / Digi_Twin is an educational and computational simulation platform. Anatomical structures, morphological scaling, and the 5-compartment Runge-Kutta pharmacokinetic model are intended strictly for educational insight. **Not intended for clinical medical advice, dosage calculation, diagnosis, or patient management.** Always consult a licensed healthcare professional for medical concerns.

---

## License

This project's code is licensed under the [MIT License](LICENSE).  
The underlying anatomical geometry is licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) by DBCLS.
