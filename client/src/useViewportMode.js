import { useEffect, useState } from "react";

// A "phone" viewport is judged by physical size (either dimension small) and
// a coarse pointer, not by orientation - a phone rotated to landscape is
// still a phone, just with the tight dimension swapped from height to width.
const COARSE_POINTER_QUERY = "(pointer: coarse)";
const PHONE_DIMENSION_QUERY = "(max-width: 600px), (max-height: 600px)";
const PORTRAIT_QUERY = "(orientation: portrait)";

export function classifyViewport({ isTouch, isPhoneDimension, isPortrait }) {
  const isPhoneLayout = isTouch && isPhoneDimension;
  return {
    isTouch,
    isPhoneLayout,
    isPortraitPhone: isPhoneLayout && isPortrait,
    isLandscapePhone: isPhoneLayout && !isPortrait,
  };
}

function matches(query) {
  return typeof window !== "undefined" && window.matchMedia
    ? window.matchMedia(query).matches
    : false;
}

function readRaw() {
  return {
    isTouch: matches(COARSE_POINTER_QUERY),
    isPhoneDimension: matches(PHONE_DIMENSION_QUERY),
    isPortrait: matches(PORTRAIT_QUERY),
  };
}

// Live viewport classification, updated on resize/rotation. Prefer
// classifyViewport directly in tests; this hook just wires it to matchMedia.
export function useViewportMode() {
  const [raw, setRaw] = useState(readRaw);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const queries = [COARSE_POINTER_QUERY, PHONE_DIMENSION_QUERY, PORTRAIT_QUERY].map((q) =>
      window.matchMedia(q)
    );
    const update = () => setRaw(readRaw());
    queries.forEach((mq) => mq.addEventListener("change", update));
    update();
    return () => queries.forEach((mq) => mq.removeEventListener("change", update));
  }, []);

  return classifyViewport(raw);
}
