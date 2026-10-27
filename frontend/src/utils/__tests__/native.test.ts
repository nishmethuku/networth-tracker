import { afterEach, describe, expect, it } from "vitest";
import { isNativeApp } from "../native";

afterEach(() => {
  delete (window as any).Capacitor;
});

describe("isNativeApp", () => {
  it("is false in a normal browser", () => {
    expect(isNativeApp()).toBe(false);
  });
  it("is true inside the iOS or Android app", () => {
    (window as any).Capacitor = { isNativePlatform: () => true };
    expect(isNativeApp()).toBe(true);
  });
  it("is false when Capacitor reports the web", () => {
    (window as any).Capacitor = { isNativePlatform: () => false };
    expect(isNativeApp()).toBe(false);
  });
});
