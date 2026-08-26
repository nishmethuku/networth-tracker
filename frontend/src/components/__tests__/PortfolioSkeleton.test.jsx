import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import PortfolioSkeleton from "../PortfolioSkeleton";

describe("PortfolioSkeleton", () => {
  it("renders without crashing and matches its known layout shape", () => {
    const { container } = render(<PortfolioSkeleton />);
    expect(container).toMatchSnapshot();
  });
});
