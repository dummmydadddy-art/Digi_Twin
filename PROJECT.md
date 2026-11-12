# Body Twin — Project Tracker

**Educational 3D human anatomy and drug-digestion simulator**
*Vite + TypeScript + React + Three.js (Forked from Human Atlas / BodyParts3D CC BY 4.0)*

---

## Architecture & Decisions
- **Rendering & Assets**: Pure client-side static site; Three.js `WebGLRenderer` rendering BodyParts3D compressed binary chunks (`public/models/atlas.json`, `body-*.bin`).
- **Data Integrity**: All drug parameters include source citations or explicit assumption flags. Educational disclaimer displayed prominently: *"Educational model, not medical advice."*
- **Licensing & Credits**: Retains visible Credits panel citing BodyParts3D (The Database Center for Life Science, CC BY 4.0) and Human Atlas MIT foundation.

---

## Roadmap & Status

### Phase 1: Branding, Centering & 360° Orbit (Completed)
- [x] Update application branding to "Body Twin" with educational disclaimer ("Educational model · Not medical advice").
- [x] Configure `OrbitControls` so dragging orbits 360° smoothly around the centered anatomy pivot (`[0, 0.88, 0]`).
- [x] Ensure visible Credits panel / Attribution modal is clearly accessible and cites BodyParts3D (CC BY 4.0) and Human Atlas (MIT).
- [x] Verified in browser: model centered across 360° orbit, back view, and credits modal.

### Phase 2: Cursor-Based Layer Peeling & Zoom-to-Organ (Next Phase)
- [ ] Implement scroll-over-organ depth peeling (skin > muscle > skeleton > organs) around cursor raycast.
- [ ] Implement smooth zoom toward the target organ along current view angle.
- [ ] Click organ to focus; Escape key or reset button to un-focus and restore default view.

### Phase 3: Cutaway View & Organ Info Card
- [ ] Implement cutaway / sectional clipping or selective transparency for focused organ.
- [ ] Render concise organ dossier card with physiological function & pharmacological role.

### Phase 4: Patient Profile Panel & Morphological Scaling
- [ ] Add Patient Panel: Sex, Age, Height (cm), Weight (kg), Blood Group, Drug Allergy.
- [ ] Dynamic scaling of anatomical model (height Y, girth X/Z) with label noting adult male reference approximation.

### Phase 5: Pharmacokinetics & Drug Simulation Engine
- [ ] Sourced drug library (Paracetamol, Ibuprofen, Aspirin, Amoxicillin) with explicit parameter citations.
- [ ] Oral ingestion path animation: mouth > esophagus > stomach > small intestine > bloodstream.
- [ ] Real-time one-compartment PK differential solver with liver clearance & renal excretion visual highlights.
- [ ] Dynamic Bateman concentration chart (`canvas`) and therapeutic effect progress bar.
- [ ] Safety warnings: allergy contraindication block, weight-based dose threshold warnings.

### Phase 6: 60 FPS Polish & Mobile/Desktop Optimization
- [ ] GPU shader optimization, frame budget auditing, and memory cleanup.
- [ ] Final manual test checklist and documentation.

---

## Current Phase
**Phase 1 Completed. Ready for Phase 2: Cursor-Based Layer Peeling & Zoom-to-Organ** (Awaiting user approval of plan)

## Known Issues / Notes
- Node v24 + Vite 8 environment. Base repo builds cleanly.
