import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import DashboardSkeleton from "../DashboardSkeleton";

describe("DashboardSkeleton", () => {
  it("renders without crashing and matches its known layout shape", () => {
    const { container } = render(<DashboardSkeleton />);
    expect(container).toMatchSnapshot();
  });
});
