import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import HoldingTypeGuide, { HOLDING_TYPE_HELP } from "../HoldingTypeGuide";
import { ASSET_TYPES, ASSET_TYPE_LABELS } from "../../constants/enums";

describe("HoldingTypeGuide", () => {
  it("explains every holding type the app supports", () => {
    expect(HOLDING_TYPE_HELP.map(([type]) => type).sort()).toEqual(Object.values(ASSET_TYPES).sort());
  });

  it("shows each type by the same name as the Add Holding list", () => {
    render(<HoldingTypeGuide />);
    for (const label of Object.values(ASSET_TYPE_LABELS)) {
      expect(screen.getByText(`${label}:`)).toBeTruthy();
    }
  });
});
