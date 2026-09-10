import { describe, expect, it } from "vitest";
import { classifyViewport } from "../useViewportMode";

describe("classifyViewport", () => {
  it("desktop mouse, large screen: no phone layout", () => {
    expect(classifyViewport({ isTouch: false, isPhoneDimension: false, isPortrait: false })).toEqual({
      isTouch: false,
      isPhoneLayout: false,
      isPortraitPhone: false,
      isLandscapePhone: false,
    });
  });

  it("touch tablet with a large screen: touch but not phone layout", () => {
    expect(classifyViewport({ isTouch: true, isPhoneDimension: false, isPortrait: true })).toEqual({
      isTouch: true,
      isPhoneLayout: false,
      isPortraitPhone: false,
      isLandscapePhone: false,
    });
  });

  it("small screen without a coarse pointer (narrow desktop window): not phone layout", () => {
    expect(classifyViewport({ isTouch: false, isPhoneDimension: true, isPortrait: true })).toEqual({
      isTouch: false,
      isPhoneLayout: false,
      isPortraitPhone: false,
      isLandscapePhone: false,
    });
  });

  it("phone in portrait", () => {
    expect(classifyViewport({ isTouch: true, isPhoneDimension: true, isPortrait: true })).toEqual({
      isTouch: true,
      isPhoneLayout: true,
      isPortraitPhone: true,
      isLandscapePhone: false,
    });
  });

  it("phone in landscape", () => {
    expect(classifyViewport({ isTouch: true, isPhoneDimension: true, isPortrait: false })).toEqual({
      isTouch: true,
      isPhoneLayout: true,
      isPortraitPhone: false,
      isLandscapePhone: true,
    });
  });
});
