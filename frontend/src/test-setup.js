import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom";

// jsdom doesn't implement matchMedia at all -- any component that renders
// useIsMobile (Portfolio, Budget, Dashboard, ...) would otherwise throw
// "window.matchMedia is not a function" the moment a test tries to render
// it. Stubbed to always report "not matching" (desktop layout) since no
// test here needs to actually simulate a narrow viewport -- that's what
// the Playwright mobile.spec.ts suite is for, against a real browser.
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}

// Cleanup after each test
afterEach(() => {
  cleanup();
});
