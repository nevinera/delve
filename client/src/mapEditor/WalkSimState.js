// Walk Preview mode's own state - a read-only "walk it" 3D preview
// (MapPreviewScene/MapPreviewCanvas) swapped in for MapCanvas's whole
// top-down view. Deliberately thin: any real animation state (camera,
// movement) lives entirely inside MapPreviewScene, opaque to this wrapper -
// there's nothing here but "is it active", plus the mutual-exclusion
// behavior every other mode in this editor has (see UiState.js's own
// #clearModes/#startX methods, which this mirrors at the top level).
//
// Immutable, like UiState/MapDraft: #start/#stop return a new instance.
export class WalkSimState {
  constructor(active = false) {
    this.active = active;
  }

  start() {
    return new WalkSimState(true);
  }

  stop() {
    return new WalkSimState(false);
  }
}
