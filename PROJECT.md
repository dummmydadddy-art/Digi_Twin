# Body Twin — Project Tracker & Architecture Reference

**Educational 3D human anatomy and drug-digestion simulator**  
*Vite + TypeScript + React + Three.js (Forked from Human Atlas / BodyParts3D CC BY 4.0)*

---

## 1. Repository Folder Structure

```
d:\8th Semester Project\
├── app/                           # Core application logic & UI
│   ├── page.tsx                   # Main React page: UI layout, layer toggles, search combobox, sheets
│   ├── scene.tsx                  # Three.js WebGL canvas, OrbitControls, shader materials, batch rendering
│   ├── anatomy.ts                 # Data models: 15 anatomical systems, Part/Concept types, explanations
│   ├── explosion-layout.ts        # 2D/3D unpacked layout calculator for anatomical inventory
│   ├── model-download.ts          # DecompressionStream chunk decoder for binary mesh assets
│   ├── pointer-tap.ts             # Pointer movement & threshold analyzer (tap vs drag detection)
│   ├── agent-tools.ts             # Headless anatomy query & selection helpers
│   └── globals.css                # Tailwind CSS v4 design tokens, glassmorphism, responsive styles
├── components/ui/                 # shadcn / Base UI primitives
│   ├── badge.tsx, button.tsx, combobox.tsx, sheet.tsx, slider.tsx, switch.tsx
├── lib/
│   └── utils.ts                   # Class variance & clsx styling utility (`cn()`)
├── public/
│   ├── models/
│   │   ├── atlas.json             # Manifest: 2,234 parts, 3,432 concepts, byte offsets, bounding boxes
│   │   ├── body-0.bin .. body-14.bin       # Raw quantized binary geometry chunks
│   │   └── body-0.bin.gz .. body-14.bin.gz # Gzip compressed geometry chunks (~2.2MB each)
│   ├── ATTRIBUTION.md             # Dataset licensing & BodyParts3D CC BY 4.0 documentation
│   └── favicon.svg                # Application icon
├── web/
│   ├── index.html                 # HTML shell, title, viewport configuration
│   └── main.tsx                   # React 19 entry point (`createRoot`)
├── package.json                   # Dependencies: Three.js r159, React 19, Vite 8, Tailwind v4
├── tsconfig.json                  # TypeScript compiler settings
├── vite.config.ts                 # Vite bundler configuration
└── PROJECT.md                     # Architecture, organ breakdown, phase roadmap & risks
```

---

## 2. Technical Architecture & Engine Mechanics

### A. How Meshes Are Loaded
- **Asset Storage**: The anatomy model is partitioned into **15 binary chunks** (`public/models/body-*.bin` / `.bin.gz`, total ~33 MB compressed).
- **Chunk Manifest (`atlas.json`)**: Contains metadata for 2,234 parts, specifying vertex count, index count, byte offsets (`positions`, `normals`, `indices`), system ID, and 3D bounding box coordinates.
- **Decompression & Streaming**: `app/scene.tsx` (`loadChunk`) fetches chunks in batches of 3 parallel workers using `fetch()` and native `DecompressionStream`.
- **Buffer Parsing**:
  - Positions: Read as `Float32Array` (3 floats per vertex).
  - Normals: Stored as quantized 16-bit signed shorts (`Int16Array`, 3 elements per vertex, normalized flag `true`). This cuts normal buffer memory by 50% on both CPU and GPU.
  - Indices: Read as `Uint32Array`.
- **System Merging**: Instead of rendering 2,234 separate meshes, geometries sharing the same `system` within a chunk are batched together via Three.js `mergeGeometries(gs, false)`. This reduces 2,234 potential draw calls to **only ~15–20 draw calls per frame**, which is essential for 60 fps rendering.
- **Raycasting Proxy**: An unmerged array of invisible proxy meshes (`pickers[i]`) is maintained solely for raycast collision detection.

### B. How Systems / Layers Are Defined
- **15 Anatomical Systems** are declared in `app/anatomy.ts`:
  1. `integumentary` (Skin / body surface: rendered semi-transparent, `opacity: 0.1`, `depthWrite: false`)
  2. `muscular` (Skeletal muscle groups, `#a85b50`)
  3. `skeletal` (Bones and joints, `#e2d9ba`)
  4. `cardiac` (Heart chambers, valves, myocardium, `#b96760`)
  5. `arterial` (Arterial circulatory network, `#c05245`)
  6. `venous` (Venous circulatory network, `#527c9f`)
  7. `nervous` (Brain, spinal cord, cranial & peripheral nerves, `#d8b565`)
  8. `respiratory` (Airways, bronchial tree, nasal cartilages, `#b98991`)
  9. `digestive` (Esophagus, stomach, intestines, liver, pancreas, gallbladder, `#b8916b`)
  10. `urinary` (Kidneys, ureters, urinary bladder, urethra, `#b47961`)
  11. `lymphatic` (Lymph vessels and regional lymph nodes, `#879f7c`)
  12. `endocrine` (Thyroid, adrenal glands, thymus, `#c5a09a`)
  13. `reproductive` (Male pelvic/reproductive anatomy, `#bda098`)
  14. `connective` (Cartilage, articular ligaments, `#aec3bb`)
  15. `sensory` (Eyes, sensory structures, `#b0c8ce`)

- **GPU Data Texture State Engine**:
  - Layer visibility and explosion displacement are driven by a dynamic 4096×1 `Float32Array` `THREE.DataTexture` (`partTexture`).
  - Each part's state pixel stores `(dx, dy, dz, visibility)`.
  - When a system is toggled off, `visibility` is set to `0.0`.
  - In `MeshStandardMaterial.onBeforeCompile`:
    ```glsl
    // Vertex Shader:
    vec2 stateUv = vec2((partIndex + 0.5) / stateWidth, 0.5);
    vec4 state = texture2D(partState, stateUv);
    transformed += state.xyz;
    partVisible = state.w;
    
    // Fragment Shader:
    if (partVisible < 0.5) discard;
    ```
  - **Zero CPU Re-allocation**: Toggling layers requires only updating the data texture in GPU memory (`partTexture.needsUpdate = true`); no scene graphs are reconstructed.

### C. How Picking & Selection Work
1. **Pointer Detection**: `app/pointer-tap.ts` monitors pointer movement. If a mouse-up occurs within a 5-pixel threshold of pointer-down, it is registered as an intentional click/tap rather than an orbit drag.
2. **Raycasting**:
   - `THREE.Raycaster` projects from camera coordinates.
   - It iterates through the unmerged `pickers[i]` array.
   - Bounding-box test (`raycaster.ray.intersectBox(worldBox)`) discards non-matching candidates instantly.
   - **Skin Occlusion Bypass**: If any solid internal part is visible, the raycaster automatically ignores the `integumentary` (skin) mesh so the user directly clicks the underlying organ rather than the surface capsule.
3. **Selection Highlighting**:
   - Selection state is written to a second data texture: `selectionTexture` (`Uint8Array`, 255 for selected parts).
   - The fragment shader samples `selectionTexture` and blends a glowing turquoise highlight (`vec3(0.42, 0.85, 0.78) * 0.75`) onto the diffuse color without re-rendering or swapping materials.

### D. Camera & Orbit Setup
- **Camera**: `THREE.PerspectiveCamera(34, aspect, 0.005, 100)`.
- **Orbit Controls**: Three.js `OrbitControls` configured on the canvas element:
  - Center Pivot Target: `(0, 0.88, 0)` in normal view, exactly pinning the vertical midpoint of the 1.75m body.
  - Left Mouse / One-finger Touch: Dedicated 360° horizontal orbit (`minAzimuthAngle: -Infinity`, `maxAzimuthAngle: Infinity`).
  - Polar Angle: Clamped to `[0.05, 0.95 * Math.PI]` to avoid gimbal lock at straight top/bottom poles.
  - Smooth Damping: Enabled (`dampingFactor: 0.085`).
  - Focus Transitions: `fit()` computes trigonometric bounding distance and tweens `controls.target` and `camera.position` smoothly to target structures.

### E. Performance Approach
- **Draw Call Reduction**: Merges 2,234 geometry buffers into ~15 system meshes per chunk (>98% reduction in WebGL draw calls).
- **Quantization**: Signed 16-bit normalized normals reduce memory footprint and bandwidth.
- **Shader-Level State**: Explosion displacements, layer visibility flags, and selection states are passed through 1D data textures, bypassing CPU scene graph traversals.
- **Frame Limiting via Dirty Flag**: `renderer.render()` executes only when the scene is marked `dirty` (orbiting, damping, exploding, or transitioning), saving battery and GPU load on idle.
- **Pixel Ratio Caps**: `Math.min(devicePixelRatio, width < 768 ? 1.5 : 2)` prevents fill-rate bottlenecks on high-DPI/Retina screens.

---

## 3. Detailed Organ Breakdown (BodyParts3D Data Inventory)

BodyParts3D distinguishes between **Parts** (individual raw 3D mesh objects in the binary chunks) and **Concepts** (FMA ontological anatomical entities grouping one or more parts).

| Organ | Exists as Named Mesh? | Mesh IDs & Concept References | Internal Sub-structures or Surface Only? | Anatomical Details in Dataset |
| :--- | :--- | :--- | :--- | :--- |
| **Skin** | **Yes** (1 direct part) | Part: `FJ2810` ("Skin"), Concept: `FMA7163` | **Surface only** | A single outer polygonal envelope enclosing the entire body (system: `integumentary`). Rendered with transparency. |
| **Heart** | **No single outer mesh** (Compound concept) | Concept: `FMA7088` ("heart") containing **83 distinct meshes** | **Rich internal sub-structures** | Contains cavity volumes for all 4 chambers (`Cavity of left ventricle`, `Cavity of right ventricle`, `Cavity of right atrium`, `Cavity of left atrium`), muscular walls (`Wall of ventricle`, `Wall of left atrium`), valves/leaflets (`Mitral valve anterior/posterior leaflets`, `Tricuspid valve leaflets`, `Aortic valve cusps`, `Pulmonary valve cusps`), and papillary muscles. |
| **Lungs** | **No single outer mesh** (Compound concepts) | Concepts: `FMA7309` ("right lung", 156 parts) & `FMA7310` ("left lung", 124 parts) | **Internal sub-structures (Airways & Vessels)** | Consists of segmental bronchial trees (superior, lingular, apical, medial, lateral branches) and segmental pulmonary arterial/venous trees. **Does NOT have an enclosing lobar pleural surface shell**. |
| **Liver** | **No single outer mesh** (Compound concept) | Concept: `FMA7197` ("liver") containing **60 distinct meshes** | **Internal sub-structures + Lobes** | Divided into lobar parenchyma sectors (`Caudate lobe of liver` `FJ2816`, anterior/posterior sectors, left/right hemiliver) intertwined with the branching portal vein tree, hepatic arterial branches, and hepatic biliary duct trees. |
| **Stomach** | **Yes** (1 direct part) | Part: `FJ2564` ("Stomach"), Concept: `FMA7148` | **Surface only** | A single continuous 3D shell representing the gastric organ wall. No internal mucosal layer or lumen mesh separation. |
| **Small Intestine** | **Yes** (Multiple segmental parts) | Part: `FJ2573` ("Duodenum") + Concept `FMA7200` ("small intestine", 56 parts) | **Segmental sub-structures** | Composed of 1 `Duodenum` mesh (`FJ2573`), 23 sequential `Jejunum` segmented loops (`FJ2606`–`FJ2628`), and 32 `Ileum` segmented loops (`FJ2574`–`FJ2605`). Each segment is a hollow tubular surface. |
| **Large Intestine** | **Yes** (Multiple segmental parts) | Concept: `FMA7201` ("large intestine", 8 parts) | **Segmental sub-structures** | Composed of `Ascending colon` (`FJ2566`), `Transverse colon` (`FJ2572`), `Descending colon` (`FJ2567`), `Rectum` (`FJ2571`), `Ileocecal junction`, and longitudinal muscle bands (`Taenia libera`, `Taenia mesocolica`, `Taenia omentalis`). |
| **Oesophagus (Esophagus)** | **Yes** (1 direct part) | Part: `FJ2563` ("Esophagus"), Concept: `FMA7131` | **Surface only** | A single continuous tubular muscular surface running from pharynx to gastric cardia. |
| **Kidneys** | **Yes** (2 direct parts) | Parts: `FJ3145` ("Left kidney") & `FJ3147` ("Right kidney"), Concept: `FMA7203` | **Surface only (Renal Capsule)** | Each kidney exists as an outer renal parenchyma surface mesh in the `urinary` system. Internal renal pyramids, medulla, and calyces are not separate meshes (though 44 segmental renal artery/vein branches connect into them). |
| **Bladder** | **Yes** (1 direct part) | Part: `FJ3149` ("Urinary bladder"), Concept: `FMA15900` | **Surface only** | A single hollow organ surface shell representing the pelvic urinary reservoir. |
| **Pancreas** | **Yes** (Direct part + duct tree) | Part: `FJ1895` ("Pancreas") + Concept `FMA7198` (4 parts) | **Internal sub-structures** | Consists of `Pancreas` (`FJ1895`), `Parenchyma of pancreas` (`FJ2629`), `Pancreatic duct` (`FJ1896`), and `Pancreatic duct tree` (`FJ2630`). |
| **Brain** | **Yes** (Compound concept) | Concept: `FMA50801` ("brain", 59 parts) + Cerebellum parts (`FJ1781`, `FJ1830`) | **Rich internal sub-structures** | Contains ventricular cavities (`Third ventricle`, `Fourth ventricle`, `Lateral ventricles`, `Cerebral aqueduct`), brainstem (`Midbrain`, `Pons`, `Medulla oblongata`), diencephalon (`Hypothalamus`, `Thalamus`), and deep white/gray matter gyri (`Cingulate gyrus`, `Fornix`). |

---

## 4. Technical Risk List for Project Goals

| Goal # | Goal Description | Technical Risks | Mitigation Strategy |
| :---: | :--- | :--- | :--- |
| **Goal 1** | **360° Centered Orbit** | Model drift during vertical rotation or after patient scaling (Goal 4) alters height/proportions. | Keep `controls.target` bound to dynamic anatomical center `(0, 0.88 * scaleY, 0)`; clamp polar angle to avoid pole flips. *(Phase 1 Verified)* |
| **Goal 2** | **Cursor-Based Layer Peeling & Zoom** | 1. **Binary Shading Barrier**: Currently, `partTexture` only passes binary visibility (`discard if < 0.5`). Smooth radial peeling needs per-system or distance-based opacity blending.<br>2. **Raycast Surface Block**: Mouse hovering over chest always hits skin (`integumentary`) or superficial pectoralis muscle unless peeling dynamically adjusts collision filters. | 1. Implement radial/layer distance thresholds in shader uniforms (peeling `integumentary` → `muscular` → `skeletal` → `internal organs`).<br>2. Filter out peeled systems from the raycaster picker list so underlying organs (heart, stomach) become interactive. |
| **Goal 3** | **Focused Organ Cutaway & Info Card** | 1. **Single-Sided Rendering**: Hollow organs (stomach, bladder) or compound organs (heart) will show black backfaces or invisible hollow shells if clipped with basic planes.<br>2. **No Lobe Envelope for Lungs**: Slicing the lung will show floating bronchial tubes rather than solid sliced parenchyma. | 1. Use `THREE.DoubleSide` and local clipping planes (`material.clippingPlanes`) with cross-section stencil or capping shaders.<br>2. For organs without outer shells (lungs/liver), clip the bronchial/vascular tree cleanly and present cross-sectional highlighting. |
| **Goal 4** | **Patient Scaling Panel** | 1. **Merged Geometries Disconnection**: Scaling the root `Scene` or `Group` could decouple collision bounding boxes in `bounds` from visual meshes.<br>2. **Anatomical Distortion**: Scaling adult male reference meshes non-uniformly to simulate female or child anatomy can cause unnatural distortions. | 1. Scale a parent `BodyGroup` containing both visual merged meshes and raycaster proxy meshes synchronously.<br>2. Keep prominent disclaimer: *"Approximation based on adult male BodyParts3D reference."* Restrict scale factors within clinically plausible ranges (`0.75x` to `1.25x`). |
| **Goal 5** | **Drug Digestion Simulation** | 1. **No Pre-defined Luminal Spline**: BodyParts3D lacks an internal curve path through the lumen of the esophagus, stomach, and duodenum for pill descent.<br>2. **Medical Accuracy Mandate**: Inventing fake rates or volumes violates the rule ("Never invent medical data. Every drug parameter needs a source field").<br>3. **Organ Highlighting**: Merged system meshes make it impossible to change liver color without affecting other digestive organs unless shader uniforms or the data texture are used. | 1. Construct 3D Catmull-Rom spline waypoints derived from the actual mesh centers of esophagus (`FJ2563`), stomach (`FJ2564`), and duodenum (`FJ2573`).<br>2. Build a verified pharmacokinetic parameter table with explicit literature citations (Goodman & Gilman, FDA inserts, Rowland & Tozer) and clear `"source"` / `"assumption"` tags.<br>3. Use the existing `selectionTexture` or dedicated organ color channels in `partTexture` to illuminate liver and kidneys specifically during clearance. |
| **Goal 6** | **60 FPS on Mid-Range Laptop** | Real-time particle animations (dissolving molecules) + continuous 60 fps graph rendering could trigger frame drops or garbage collection pauses if new objects are allocated in `requestAnimationFrame`. | 1. Pre-allocate all Three.js vectors, matrices, and arrays (zero `new` allocations in render loop).<br>2. Render pharmacokinetic chart on an offscreen 2D canvas only when simulation clock advances, throttling chart redrawing to 15–30 Hz while keeping 3D canvas at 60 Hz. |

---

## Roadmap & Status

### Phase 1: Branding, Centering & 360° Orbit (Completed)
- [x] Update application branding to "Body Twin" with educational disclaimer.
- [x] Configure `OrbitControls` so dragging orbits 360° smoothly around the centered anatomy pivot (`[0, 0.88, 0]`).
- [x] Ensure visible Credits panel / Attribution modal is clearly accessible and cites BodyParts3D (CC BY 4.0) and Human Atlas (MIT).
- [x] Verified in browser: model centered across 360° orbit, back view, and credits modal.

### Phase 2: Cursor-Based Layer Peeling & Zoom-to-Organ (Completed)
- [x] Implement scroll-over-organ depth peeling (skin > muscle > skeleton > organs) around cursor raycast using custom shader uniforms (`uPeel`, `uPeelCenter`, `uPeelRadius`, `uTier`) with screen-door dither transparency for artifact-free rendering at 60 fps.
- [x] Implement smooth zoom and dolly toward the target organ along the current view angle, preserving azimuth and elevation.
- [x] Click organ to focus with smooth lerp fly-to animation; auto-advance peel if needed to reveal deep structures.
- [x] Escape key listener and Reset button to dismiss focus, smoothly fly back to full-body view, and reset peel to 0.
- [x] Visible Layer Peeling slider in bottom dock as touch fallback with live status badge (`Skin`, `Muscles`, `Skeleton`, `Organs`).
- [x] Verified in browser: progressive peeling (Skin 0% -> Muscles 35% -> Skeleton 65% -> Organs 85%), click-to-focus on Heart with inspector sheet, Escape key reset, and wheel dolly peeling.

### Phase 3: Cutaway View, Physiological Motion & Clinical Dossier Card (Completed)
- [x] Implement selective clipping-plane cutaway shader for focused organs (`uCutawayEnabled`, `uFocusCenter`, `uCutawayNormal`, `uCutawayOffset`) with colored cap boundary edge (`#38bdf8`) and mucosal backface illumination (`!gl_FrontFacing`).
- [x] Add honest physiological motion in vertex shaders:
  - Cardiac: two-stage lub-dub systolic ventricular contraction & diastolic atrial relaxation (~72 bpm).
  - Respiratory: gentle rhythmic thoracic expansion (~14 bpm).
  - Digestive: progressive traveling peristalsis wave along small intestine loops.
- [x] Organ dossier card with location, physiological function, and 3 clinical/pharmacological facts.
- [x] Explicit geometry notice badge: distinguished multi-part internal compound structures (e.g. Heart with 83 parts) vs surface-only reference meshes (e.g. Stomach, Kidneys) labeled with: *"Surface-only mesh in reference anatomy; cross-section generated via shader cutaway."*
- [x] Cutaway toggle switch allows switching between full outer surface and cross-sectional cutaway.
- [x] Escape key resets camera and dismisses detail panel.
- [x] Verified in browser with 4 high-resolution screenshots.

### Phase 4: Patient Profile Panel & Morphological Scaling (Completed)
- [x] Typed patient data structures (`PatientProfile`, `Sex`, `BloodGroup`, `DrugAllergy`) stored in application state and ready for consumption by Phase 5 PK engine.
- [x] Morphological scale engine:
  - Height scales along Y axis ($135\text{ cm} - 210\text{ cm}$, reference $175\text{ cm}$).
  - Weight scales torso and abdominal girth along X and Z axes from BMI ($40\text{ kg} - 140\text{ kg}$, reference $70\text{ kg}$).
  - Sensible geometric clamps prevent unnatural distortion ($0.70\times$ to $1.45\times$).
  - Biological sex and age subtly adjust frame proportions: female gracile frame ($0.96\times$ shoulder, $1.04\times$ pelvic girth), age-related disc compression ($0.06\%/\text{year}$ after 40), and midriff expansion.
- [x] Derived pharmacokinetic parameters computed dynamically:
  - BMI with clinical categorization (Underweight, Normal, Overweight, Obese).
  - Mosteller Body Surface Area (BSA).
  - Total Body Water (TBW via Watson formula) for volume of distribution ($V_d$) scaling.
  - Estimated Creatinine Clearance (eCrCl via Cockcroft-Gault) for renal clearance ($k_e$) modulation.
- [x] Educational approximation notice prominently displayed in patient sheet and in the 3D scene caption (`"30YO MALE · 175CM · 70KG · APPROXIMATION"`).
- [x] Interactive Patient Profile sheet with live sliders, blood group selectors, and documented drug allergy flags with hypersensitivity warning alert.
- [x] 3D anatomy root group, raycaster bounding boxes, and camera pivot target dynamically synced with scale factors.
- [x] Verified in browser with 5 automated screenshot checkpoints.

### Phase 5: Pharmacokinetics Engine & Drug Simulation (Completed)
- [x] Pure TypeScript Pharmacokinetic Engine (`src/pk/`):
  - 5 physiological compartments: Stomach ($A_{\text{stomach}}$), Gut ($A_{\text{gut}}$), Systemic Plasma ($A_{\text{plasma}}$), Liver ($A_{\text{liver}}$), Kidney ($A_{\text{kidney}}$), plus unabsorbed lumen residue.
  - First-order stomach emptying ($k_{\text{empty}}$), intestinal carrier/passive absorption ($k_a$), oral bioavailability ($F$), volume of distribution ($V_d$ per kg), hepatic clearance ($CL_h$), and Cockcroft-Gault-modulated renal clearance ($CL_r$).
  - 4th-Order Runge-Kutta (RK4) numerical ODE solver with guaranteed mathematical mass conservation ($\Delta \sum A_i = 0$, error $< 0.0001\%$).
  - Web Worker integration (`worker.ts` & `worker-client.ts`) with synchronous engine fallback.
- [x] Sourced Drug Catalog (`src/pk/drugs.json`):
  - Paracetamol, Ibuprofen, Aspirin, Amoxicillin with peer-reviewed literature citations (Prescott LF 1980, Davies NM 1998, Rowland M 1968, Sjövall J 1985, Goodman & Gilman 14th Ed, FDA reviews, Rowland & Tozer 5th Ed) and explicit `"assumption: fasted gastric motility"` tags.
  - Clinical therapeutic windows, toxic thresholds, and documented literature $T_{\max}$ / $C_{\max}$ peak ranges.
- [x] Clinical Safety Module (`src/pk/safety.ts`):
  - Allergy contraindication block: locks simulation if patient has matching hypersensitivity (Penicillin blocks Amoxicillin with red alert and disables Swallow button; NSAID allergy blocks Aspirin and Ibuprofen).
  - Per-kg weight-adjusted dose warning: flags doses exceeding safe single-dose thresholds (e.g. Paracetamol 1000mg in 45kg patient = 22.2 mg/kg, exceeding 15 mg/kg threshold, displaying amber warning).
- [x] Comprehensive Unit Test Suite (`src/pk/__tests__/pk.test.ts`):
  - 18/18 unit tests passing across 4 suites: mass conservation across 24 hours, patient weight scaling (45kg to 120kg), $T_{\max}$ and $C_{\max}$ literature validation, organ clearance routes (hepatic vs renal predominance), allergy blocks, and per-kg dose warnings.
- [x] 3D Oral Ingestion Spline & Particle Transit:
  - Catmull-Rom spline path connecting oral cavity, pharynx, esophagus (`FJ2563`), stomach (`FJ2564`), and duodenum (`FJ2573`).
  - Swallowed 3D tablet particle (glowing core and soft spherical halo) transits smoothly through the GI tract as layers auto-peel to Organs (78%).
- [x] Real-time Liver and Kidney Clearance Illumination:
  - Dynamic 1D data texture (`glowTexture`) sampled in the fragment shader without adding draw calls.
  - Liver glows with a warm golden-amber metabolic clearance hue (`vec3(0.98, 0.62, 0.16)`) during hepatic metabolism.
  - Kidneys illuminate with a vibrant cyan filtration hue (`vec3(0.18, 0.84, 0.96)`) during renal excretion.
- [x] Live Bateman Concentration Chart (`#chart`) & Therapeutic Effect Bar (`#eb`):
  - Live 24-hour plasma concentration curve on HTML5 canvas with shaded therapeutic window, dashed MEC line, and dashed toxic threshold line.
  - Live animated effect bar tracking subtherapeutic (< MEC), therapeutic active range, and toxic levels with status badge.
  - Live compartment mass distribution readouts (Stomach, Gut, Plasma, Liver Cleared, Kidney Excreted).
  - Simulation playback controls: Play/Pause, speed multipliers ($1\times, 5\times, 20\times$), simulation clock, and reset (Esc).
- [x] Verified in browser with 7 automated screenshot checkpoints.

### Phase 6: 60 FPS Polish & Mobile/Desktop Optimization
- [ ] GPU shader optimization, frame budget auditing, and memory cleanup.
- [ ] Final manual test checklist and documentation.
