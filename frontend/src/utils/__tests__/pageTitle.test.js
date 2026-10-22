import { describe, it, expect } from "vitest";
import { pageTitle, APP_NAME } from "../pageTitle";

describe("pageTitle", () => {
  it("names known pages", () => {
    expect(pageTitle("/")).toBe(`Net Worth · ${APP_NAME}`);
    expect(pageTitle("/review")).toBe(`Year in Review · ${APP_NAME}`);
    expect(pageTitle("/budget/")).toBe(`Budget · ${APP_NAME}`);
  });
  it("names holding pages and falls back for unknown ones", () => {
    expect(pageTitle("/portfolio/12")).toBe(`Holding · ${APP_NAME}`);
    expect(pageTitle("/nope")).toBe(APP_NAME);
  });
});
