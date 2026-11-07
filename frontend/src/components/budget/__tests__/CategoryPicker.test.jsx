import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import CategoryPicker from "../CategoryPicker";

const names = ["housing", "utilities", "Cellphone", "Internet"];
const parents = { Cellphone: "utilities", Internet: "utilities" };

function renderPicker(value, onChange = vi.fn()) {
  render(<CategoryPicker idPrefix="t" names={names} parents={parents} value={value} onChange={onChange} />);
  return onChange;
}

afterEach(cleanup);

describe("CategoryPicker", () => {
  it("shows the category and, when the value is a subcategory, both together", () => {
    renderPicker("Cellphone");
    expect(screen.getByLabelText("Category")).toHaveValue("utilities");
    expect(screen.getByLabelText("Subcategory")).toHaveValue("Cellphone");
  });

  it("lists only top-level categories in the first dropdown", () => {
    renderPicker("housing");
    const options = [...screen.getByLabelText("Category").querySelectorAll("option")].map((o) => o.value);
    expect(options).toEqual(["housing", "utilities"]);
  });

  it("disables the subcategory dropdown when the category has none", () => {
    renderPicker("housing");
    expect(screen.getByLabelText("Subcategory")).toBeDisabled();
    expect(screen.getByText("No subcategories")).toBeInTheDocument();
  });

  it("reports the category when it changes, and the subcategory when one is picked", () => {
    const onChange = renderPicker("utilities");
    fireEvent.change(screen.getByLabelText("Subcategory"), { target: { value: "Internet" } });
    expect(onChange).toHaveBeenLastCalledWith("Internet", "subcategory");
    fireEvent.change(screen.getByLabelText("Category"), { target: { value: "housing" } });
    expect(onChange).toHaveBeenLastCalledWith("housing", "category");
  });

  it("going back to None on the subcategory keeps the parent category", () => {
    const onChange = renderPicker("Cellphone");
    fireEvent.change(screen.getByLabelText("Subcategory"), { target: { value: "" } });
    expect(onChange).toHaveBeenLastCalledWith("utilities", "subcategory");
  });

  describe("search box", () => {
    const many = Array.from({ length: 14 }, (_, i) => `Group ${i + 1}`).concat(["Pet care"]);
    const renderMany = (onChange = vi.fn(), value = "Group 1") => {
      render(<CategoryPicker idPrefix="m" names={many} parents={{}} value={value} onChange={onChange} />);
      return onChange;
    };

    it("does not appear for a short list", () => {
      renderPicker("housing");
      expect(screen.queryByLabelText("Search categories")).toBeNull();
    });

    it("filters the dropdown as you type and keeps the picked category", () => {
      renderMany();
      fireEvent.change(screen.getByLabelText("Search categories"), { target: { value: "pet" } });
      const options = [...screen.getByLabelText("Category").querySelectorAll("option")].map((o) => o.value);
      expect(options).toEqual(["Group 1", "Pet care"]);
    });

    it("picks the first match on Enter", () => {
      const onChange = renderMany();
      const box = screen.getByLabelText("Search categories");
      fireEvent.change(box, { target: { value: "pet" } });
      fireEvent.keyDown(box, { key: "Enter" });
      expect(onChange).toHaveBeenCalledWith("Pet care", "category");
    });

    it("says when nothing matches", () => {
      renderMany();
      fireEvent.change(screen.getByLabelText("Search categories"), { target: { value: "zzz" } });
      expect(screen.getByText(/No category matches/)).toBeInTheDocument();
    });
  });
});
