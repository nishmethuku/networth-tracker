import { useMemo } from "react";
import { getBudgetCategoryLabel } from "../../constants/enums";
import { orderCategoryOptions } from "../../utils/categoryTree";

/**
 * Two linked dropdowns: the category, and the subcategory inside it. The value
 * is always the most specific one picked (the subcategory when there is one,
 * otherwise the category), which is what an entry stores.
 */
export default function CategoryPicker({ idPrefix, names, parents, value, onChange, fieldStyle, labelStyle, disabled = false }) {
  const options = useMemo(() => orderCategoryOptions(names || [], parents, getBudgetCategoryLabel), [names, parents]);
  const tops = options.filter((o) => !o.parent);
  const parentOfValue = options.find((o) => o.value === value)?.parent || null;
  const topValue = parentOfValue || value;
  const subs = options.filter((o) => o.parent === topValue);
  const subLabel = (o) => getBudgetCategoryLabel(o.value);

  return (
    <>
      <div>
        <label htmlFor={`${idPrefix}-category`} style={labelStyle}>
          Category
        </label>
        <select
          id={`${idPrefix}-category`}
          value={topValue}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value, "category")}
          style={fieldStyle}
        >
          {tops.length === 0 && <option value="">No categories yet</option>}
          {tops.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {tops.length === 0 && (
          <a href="/expenses#manage-categories" style={{ fontSize: "0.75rem" }}>
            Add a category in Categories
          </a>
        )}
      </div>
      <div>
        <label htmlFor={`${idPrefix}-subcategory`} style={labelStyle}>
          Subcategory
        </label>
        <select
          id={`${idPrefix}-subcategory`}
          value={parentOfValue ? value : ""}
          disabled={disabled || subs.length === 0}
          onChange={(e) => onChange(e.target.value || topValue, "subcategory")}
          style={fieldStyle}
        >
          <option value="">{subs.length === 0 ? "No subcategories" : "None"}</option>
          {subs.map((o) => (
            <option key={o.value} value={o.value}>
              {subLabel(o)}
            </option>
          ))}
        </select>
      </div>
    </>
  );
}
