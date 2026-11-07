import { useMemo, useState } from "react";
import { getBudgetCategoryLabel } from "../../constants/enums";
import { orderCategoryOptions } from "../../utils/categoryTree";

// With this many categories a plain dropdown is slow to scroll, so a search box appears above it.
const SEARCH_AT = 12;

/**
 * Two linked dropdowns: the category, and the subcategory inside it. The value
 * is always the most specific one picked (the subcategory when there is one,
 * otherwise the category), which is what an entry stores.
 */
export default function CategoryPicker({ idPrefix, names, parents, value, onChange, fieldStyle, labelStyle, disabled = false }) {
  const options = useMemo(() => orderCategoryOptions(names || [], parents, getBudgetCategoryLabel), [names, parents]);
  const allTops = options.filter((o) => !o.parent);
  const [query, setQuery] = useState("");
  const searchable = allTops.length > SEARCH_AT;
  const needle = query.trim().toLowerCase();
  // The picked category always stays in the list so the dropdown never shows a blank.
  const tops = searchable && needle ? allTops.filter((o) => o.label.toLowerCase().includes(needle) || o.value === value) : allTops;
  const matches = searchable && needle ? allTops.filter((o) => o.label.toLowerCase().includes(needle)) : [];
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
        {searchable && (
          <input
            type="search"
            aria-label="Search categories"
            placeholder="Type to search categories"
            value={query}
            disabled={disabled}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              if (matches[0]) {
                onChange(matches[0].value, "category");
                setQuery("");
              }
            }}
            style={{ ...fieldStyle, marginBottom: "0.375rem" }}
          />
        )}
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
        {searchable && needle && matches.length === 0 && (
          <span style={{ fontSize: "0.75rem" }}>No category matches &ldquo;{query.trim()}&rdquo;</span>
        )}
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
