import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { LiabilityForm } from "../Liabilities";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const mortgage = {
  name: "Home mortgage",
  liability_type: "mortgage",
  currency: "USD",
  current_balance: "400000",
  original_amount: "450000",
  interest_rate: "6.5",
  notes: "",
};

const carLoan = {
  name: "Car loan",
  liability_type: "auto_loan",
  currency: "USD",
  current_balance: "12000",
  original_amount: "20000",
  interest_rate: "4.0",
  notes: "",
};

describe("LiabilityForm", () => {
  it("shows the new liability's own values when the edit target switches without unmounting the page", () => {
    // Regression: the parent previously rendered <LiabilityForm> with no
    // key, so switching which liability is being edited (clicking Edit on
    // one, then Edit on another, without closing the form first) reused
    // the same component instance -- useState(initial) only runs on
    // mount, so the form kept showing the *first* liability's values
    // while onSubmit's payload would silently save them onto the *second*
    // liability's id. The fix is a key={editing.id} on the parent's
    // <LiabilityForm> forcing a remount; this simulates that remount the
    // way React actually performs it (an unmount + fresh mount on key
    // change), not just a prop update.
    const { rerender } = render(
      <LiabilityForm key="mortgage-1" initial={mortgage} onSubmit={vi.fn()} onCancel={vi.fn()} submitting={false} />,
    );
    expect(screen.getByLabelText("Name")).toHaveValue("Home mortgage");
    expect(screen.getByLabelText("Current balance")).toHaveValue(400000);

    rerender(<LiabilityForm key="car-loan-2" initial={carLoan} onSubmit={vi.fn()} onCancel={vi.fn()} submitting={false} />);

    expect(screen.getByLabelText("Name")).toHaveValue("Car loan");
    expect(screen.getByLabelText("Current balance")).toHaveValue(12000);
  });

  it("submits the payload for the liability actually being edited after switching targets", () => {
    const onSubmitMortgage = vi.fn();
    const onSubmitCarLoan = vi.fn();
    const { rerender } = render(
      <LiabilityForm key="mortgage-1" initial={mortgage} onSubmit={onSubmitMortgage} onCancel={vi.fn()} submitting={false} />,
    );

    rerender(<LiabilityForm key="car-loan-2" initial={carLoan} onSubmit={onSubmitCarLoan} onCancel={vi.fn()} submitting={false} />);

    screen.getByRole("button", { name: /save/i }).click();

    expect(onSubmitMortgage).not.toHaveBeenCalled();
    expect(onSubmitCarLoan).toHaveBeenCalledTimes(1);
    expect(onSubmitCarLoan.mock.calls[0][0]).toMatchObject({ name: "Car loan", current_balance: 12000 });
  });
});
