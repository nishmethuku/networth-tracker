import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import UpdateBanner, { applyUpdate } from "../UpdateBanner";

function fakeServiceWorker({ controller, registration } = {}) {
  const target = new EventTarget();
  target.controller = controller === undefined ? {} : controller;
  target.getRegistration = () => Promise.resolve(registration);
  Object.defineProperty(navigator, "serviceWorker", { value: target, configurable: true });
  return target;
}

function fakeRegistration(extra = {}) {
  const reg = new EventTarget();
  Object.assign(reg, { waiting: null, installing: null }, extra);
  return reg;
}

afterEach(() => {
  delete navigator.serviceWorker;
  vi.restoreAllMocks();
});

describe("UpdateBanner", () => {
  it("shows nothing until a new version takes over an already-running page", () => {
    const sw = fakeServiceWorker({ registration: fakeRegistration() });
    render(<UpdateBanner />);
    expect(screen.queryByText(/new version/i)).toBeNull();
    act(() => {
      sw.dispatchEvent(new Event("controllerchange"));
    });
    expect(screen.getByText(/new version is ready/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reload" })).toBeTruthy();
  });

  it("shows the banner when a new version is already waiting", async () => {
    fakeServiceWorker({ registration: fakeRegistration({ waiting: { postMessage() {} } }) });
    render(<UpdateBanner />);
    await waitFor(() => expect(screen.getByText(/new version is ready/i)).toBeTruthy());
  });

  it("shows the banner when a newly found worker finishes installing", async () => {
    const worker = new EventTarget();
    worker.state = "installing";
    const reg = fakeRegistration({ installing: worker });
    fakeServiceWorker({ registration: reg });
    render(<UpdateBanner />);
    await act(async () => {}); // let getRegistration resolve
    act(() => {
      reg.dispatchEvent(new Event("updatefound"));
    });
    expect(screen.queryByText(/new version/i)).toBeNull();
    act(() => {
      worker.state = "installed";
      worker.dispatchEvent(new Event("statechange"));
    });
    expect(screen.getByText(/new version is ready/i)).toBeTruthy();
  });

  it("stays hidden on the very first install (no previous controller)", async () => {
    const sw = fakeServiceWorker({ controller: null, registration: fakeRegistration({ waiting: {} }) });
    render(<UpdateBanner />);
    await act(async () => {});
    act(() => {
      sw.dispatchEvent(new Event("controllerchange"));
    });
    expect(screen.queryByText(/new version/i)).toBeNull();
  });
});

describe("applyUpdate", () => {
  it("tells a waiting worker to skip waiting", async () => {
    const postMessage = vi.fn();
    fakeServiceWorker({ registration: fakeRegistration({ waiting: { postMessage } }) });
    vi.useFakeTimers();
    const reload = vi.fn();
    Object.defineProperty(window, "location", { value: { reload }, configurable: true });
    await applyUpdate();
    expect(postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
    vi.advanceTimersByTime(3000); // fallback reload if the takeover never fires
    expect(reload).toHaveBeenCalled();
    vi.useRealTimers();
  });
});
