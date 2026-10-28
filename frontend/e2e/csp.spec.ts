import fs from "node:fs";
import path from "node:path";
import { test, expect, mockBackend, populatedDashboard, sampleHolding, API_BASE } from "./fixtures";

/**
 * Loads real pages under the exact Content-Security-Policy that vercel.json sends in
 * production and fails on any violation. The only change is adding the e2e test hosts
 * (the mocked API and the fake Supabase project) to connect-src.
 */
function policy(): string {
  const config = JSON.parse(fs.readFileSync(path.join(process.cwd(), "vercel.json"), "utf8"));
  const header = config.headers
    .flatMap((h: { headers: { key: string; value: string }[] }) => h.headers)
    .find((h: { key: string }) => h.key === "Content-Security-Policy");
  expect(header, "vercel.json must send a Content-Security-Policy header").toBeTruthy();
  return header.value.replace("connect-src 'self'", `connect-src 'self' ${API_BASE} https://e2e-test-project.supabase.co`);
}

test("the production Content-Security-Policy blocks nothing the app needs", async ({ mockedPage: page }) => {
  const csp = policy();
  await page.addInitScript(() => {
    (window as unknown as { __csp: string[] }).__csp = [];
    document.addEventListener("securitypolicyviolation", (e) => {
      (window as unknown as { __csp: string[] }).__csp.push(`${e.violatedDirective}: ${e.blockedURI}`);
    });
  });
  await page.route("**/*", async (route) => {
    if (route.request().resourceType() !== "document") return route.fallback();
    const response = await route.fetch();
    await route.fulfill({ response, headers: { ...response.headers(), "content-security-policy": csp } });
  });
  await mockBackend(page, { dashboard: populatedDashboard, holdings: [sampleHolding] });

  for (const url of ["/", "/portfolio", "/expenses", "/budget", "/settings", "/liabilities"]) {
    await page.goto(url);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("#root")).not.toBeEmpty();
    const violations = await page.evaluate(() => (window as unknown as { __csp: string[] }).__csp);
    expect(violations, `CSP violations on ${url}`).toEqual([]);
  }
});

test("the policy forbids inline script, plugins, framing and form hijacking", () => {
  const csp = policy();
  const script = csp.split("; ").find((d) => d.startsWith("script-src")) ?? "";
  expect(script).not.toContain("'unsafe-inline'");
  expect(script).not.toContain("'unsafe-eval'");
  expect(csp).toContain("object-src 'none'");
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toContain("base-uri 'self'");
  expect(csp).toContain("form-action 'self'");
});
