import { describe, it, expect, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import UpdateBanner from "../UpdateBanner";

function fakeServiceWorker(controller) {
  const target = new EventTarget();
  target.controller = controller;
  Object.defineProperty(navigator, "serviceWorker", { value: target, configurable: true });
  return target;
}

afterEach(() => {
  delete navigator.serviceWorker;
});

describe("UpdateBanner", () => {
  it("shows nothing until a new version takes over an already-running page", () => {
    const sw = fakeServiceWorker({});
    render(<UpdateBanner />);
    expect(screen.queryByText(/new version/i)).toBeNull();
    act(() => {
      sw.dispatchEvent(new Event("controllerchange"));
    });
    expect(screen.getByText(/new version is ready/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reload" })).toBeTruthy();
  });

  it("stays hidden on the very first install (no previous controller)", () => {
    const sw = fakeServiceWorker(null);
    render(<UpdateBanner />);
    act(() => {
      sw.dispatchEvent(new Event("controllerchange"));
    });
    expect(screen.queryByText(/new version/i)).toBeNull();
  });
});
