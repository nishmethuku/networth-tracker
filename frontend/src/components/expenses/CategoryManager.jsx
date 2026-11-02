import { Fragment, useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Card from "../Card";
import { useToast } from "../../contexts/ToastContext";
import { useHousehold } from "../../contexts/HouseholdContext";
import { createBudgetCategory, updateBudgetCategory, deleteBudgetCategory, ApiError } from "../../api";
import { getBudgetCategoryLabel } from "../../constants/enums";
import { orderCategoryOptions } from "../../utils/categoryTree";

const MAX_NAME = 32;

const inputStyle = {
  padding: "0.5rem 0.75rem",
  borderRadius: "var(--radius-sm)",
  border: "1px solid var(--border)",
  background: "var(--bg)",
  color: "var(--text)",
  fontSize: "0.875rem",
};
const smallButton = {
  padding: "0.35rem 0.7rem",
  borderRadius: "var(--radius-sm)",
  border: "1px solid var(--border)",
  background: "var(--card)",
  color: "var(--text)",
  cursor: "pointer",
  fontSize: "0.8125rem",
};
const primaryButton = { ...smallButton, border: "none", background: "var(--primary)", color: "var(--text-inverse)", fontWeight: 600 };
const dangerButton = { ...smallButton, border: "none", background: "var(--danger)", color: "var(--text-inverse)", fontWeight: 600 };
const tabStyle = (active) => ({
  ...smallButton,
  padding: "0.45rem 1rem",
  fontWeight: 600,
  background: active ? "var(--primary)" : "var(--card)",
  color: active ? "var(--text-inverse)" : "var(--text)",
});

/**
 * Add, rename, move and remove categories and the subcategories inside them.
 * The built-in categories are fixed; the ones you add are fully editable.
 */
export default function CategoryManager({ categories }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { currentHouseholdId } = useHousehold();
  const [open, setOpen] = useState(false);
  const [entryType, setEntryType] = useState("expense");
  const [adding, setAdding] = useState(null); // { parent: string | "" }
  const [addName, setAddName] = useState("");
  const [editing, setEditing] = useState(null); // { id, name, parent }
  const [deleting, setDeleting] = useState(null); // { id, name }
  const [moveTo, setMoveTo] = useState("");

  // The "Manage categories" link in the add form opens this card.
  useEffect(() => {
    function openFromHash() {
      if (window.location.hash === "#manage-categories") {
        setOpen(true);
        document.getElementById("manage-categories")?.scrollIntoView?.({ block: "start" });
      }
    }
    openFromHash();
    window.addEventListener("hashchange", openFromHash);
    return () => window.removeEventListener("hashchange", openFromHash);
  }, []);

  const names = categories?.[entryType] || [];
  const parents = categories?.parents?.[entryType];
  const customByName = useMemo(() => {
    const map = new Map();
    for (const c of categories?.custom?.[entryType] || []) map.set(c.name, c);
    return map;
  }, [categories, entryType]);
  const options = useMemo(() => orderCategoryOptions(names, parents, getBudgetCategoryLabel), [names, parents]);
  const tops = options.filter((o) => !o.parent);
  const subsOf = (name) => options.filter((o) => o.parent === name);

  function refresh() {
    for (const key of ["budget-categories", "budget-entries", "budget-summary", "budget-limits", "budget-subscriptions"]) {
      queryClient.invalidateQueries({ queryKey: [key] });
    }
  }
  const fail = (fallback) => (err) => toast.error(err instanceof ApiError ? err.message : fallback);

  const addMutation = useMutation({
    mutationFn: ({ name, parent }) =>
      createBudgetCategory({ entry_type: entryType, name, household_id: currentHouseholdId, ...(parent ? { parent } : {}) }),
    onSuccess: (created) => {
      refresh();
      setAdding(null);
      setAddName("");
      toast.success(`"${created.name}" added`);
    },
    onError: fail("Could not add the category"),
  });

  const saveMutation = useMutation({
    mutationFn: ({ id, name, parent }) => updateBudgetCategory(id, { name, parent: parent || null }),
    onSuccess: (saved) => {
      refresh();
      setEditing(null);
      toast.success(`Saved "${saved.name}"`);
    },
    onError: fail("Could not save the category"),
  });

  const deleteMutation = useMutation({
    mutationFn: ({ id, moveToName }) => deleteBudgetCategory(id, moveToName ? { moveTo: moveToName } : {}),
    onSuccess: (_d, vars) => {
      refresh();
      setDeleting(null);
      setMoveTo("");
      toast.success(vars.moveToName ? `Removed. Its entries moved to ${getBudgetCategoryLabel(vars.moveToName)}` : "Category removed");
    },
    onError: fail("Could not remove the category"),
  });

  function startAdd(parent) {
    setEditing(null);
    setDeleting(null);
    setAdding({ parent });
    setAddName("");
  }

  function submitAdd(e) {
    e.preventDefault();
    const name = addName.trim();
    if (name) addMutation.mutate({ name, parent: adding.parent });
  }

  const addForm = (
    <form onSubmit={submitAdd} style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", margin: "0.4rem 0" }}>
      <input
        autoFocus
        value={addName}
        maxLength={MAX_NAME}
        onChange={(e) => setAddName(e.target.value)}
        placeholder={adding?.parent ? "e.g., Cellphone" : "e.g., Pet care"}
        aria-label={adding?.parent ? `New subcategory name inside ${getBudgetCategoryLabel(adding.parent)}` : "New category name"}
        style={{ ...inputStyle, flex: "1 1 10rem" }}
      />
      <button
        type="submit"
        disabled={!addName.trim() || addMutation.isPending}
        style={{ ...primaryButton, opacity: addName.trim() ? 1 : 0.6 }}
      >
        {addMutation.isPending ? "Adding…" : "Add"}
      </button>
      <button type="button" onClick={() => setAdding(null)} style={smallButton}>
        Cancel
      </button>
    </form>
  );

  function renderEditForm(row) {
    const hasChildren = subsOf(row.name).length > 0;
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          saveMutation.mutate(editing);
        }}
        style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", margin: "0.4rem 0" }}
      >
        <input
          autoFocus
          value={editing.name}
          maxLength={MAX_NAME}
          onChange={(e) => setEditing({ ...editing, name: e.target.value })}
          aria-label={`Name for ${row.label}`}
          style={{ ...inputStyle, flex: "1 1 10rem" }}
        />
        <select
          aria-label={`Put ${row.label} inside`}
          value={editing.parent || ""}
          disabled={hasChildren}
          title={hasChildren ? "This category has subcategories, so it stays at the top level" : undefined}
          onChange={(e) => setEditing({ ...editing, parent: e.target.value })}
          style={{ ...inputStyle, flex: "0 1 11rem" }}
        >
          <option value="">Top level</option>
          {tops
            .filter((t) => t.value !== row.name)
            .map((t) => (
              <option key={t.value} value={t.value}>
                Inside {t.label}
              </option>
            ))}
        </select>
        <button type="submit" disabled={!editing.name.trim() || saveMutation.isPending} style={primaryButton}>
          {saveMutation.isPending ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={() => setEditing(null)} style={smallButton}>
          Cancel
        </button>
      </form>
    );
  }

  function renderDeleteForm(row) {
    const targets = options.filter((o) => o.value !== row.name && !(o.parent === row.name));
    return (
      <div role="group" aria-label={`Remove ${row.label}`} style={{ display: "grid", gap: "0.4rem", margin: "0.4rem 0" }}>
        <span style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
          Remove &ldquo;{row.label}&rdquo;? Entries that already use it keep the name unless you move them. Its subcategories move up to the
          top level.
        </span>
        <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
          <select
            aria-label="Move its entries to"
            value={moveTo}
            onChange={(e) => setMoveTo(e.target.value)}
            style={{ ...inputStyle, flex: "1 1 11rem" }}
          >
            <option value="">Keep entries as they are</option>
            {targets.map((o) => (
              <option key={o.value} value={o.value}>
                Move entries to {o.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={deleteMutation.isPending}
            onClick={() => deleteMutation.mutate({ id: deleting.id, moveToName: moveTo })}
            style={dangerButton}
          >
            {deleteMutation.isPending ? "Removing…" : "Remove"}
          </button>
          <button type="button" onClick={() => setDeleting(null)} style={smallButton}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  function renderRow(o, isChild) {
    const custom = customByName.get(o.value);
    const isEditing = editing && custom && editing.id === custom.id;
    const isDeleting = deleting && custom && deleting.id === custom.id;
    const row = { name: o.value, label: getBudgetCategoryLabel(o.value) };
    return (
      <li key={o.value} style={{ padding: "0.45rem 0", borderBottom: "1px solid var(--border)", marginLeft: isChild ? "1.5rem" : 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
          <span style={{ flex: "1 1 8rem", color: "var(--text)", fontWeight: isChild ? 400 : 600 }}>
            {isChild ? "↳ " : ""}
            {row.label}
          </span>
          {!custom && <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Built in</span>}
          {custom && !isEditing && !isDeleting && (
            <>
              <button
                type="button"
                style={smallButton}
                aria-label={`Edit ${row.label}`}
                onClick={() => {
                  setAdding(null);
                  setDeleting(null);
                  setEditing({ id: custom.id, name: custom.name, parent: custom.parent || "" });
                }}
              >
                Rename or move
              </button>
              <button
                type="button"
                style={smallButton}
                aria-label={`Remove ${row.label}`}
                onClick={() => {
                  setAdding(null);
                  setEditing(null);
                  setMoveTo("");
                  setDeleting({ id: custom.id, name: custom.name });
                }}
              >
                Remove
              </button>
            </>
          )}
          {!isChild && !isEditing && !isDeleting && (
            <button
              type="button"
              style={smallButton}
              aria-label={`Add a subcategory inside ${row.label}`}
              onClick={() => startAdd(o.value)}
            >
              + Subcategory
            </button>
          )}
        </div>
        {isEditing && renderEditForm(row)}
        {isDeleting && renderDeleteForm(row)}
        {adding && adding.parent === o.value && !isChild && addForm}
      </li>
    );
  }

  return (
    <div id="manage-categories" style={{ marginBottom: "1.5rem", scrollMarginTop: "1rem" }}>
      <Card title="Categories and subcategories">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap" }}>
          <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: "0.875rem" }}>
            Add, rename, move or remove the categories you file entries under, and the subcategories inside them.
          </p>
          <button type="button" aria-expanded={open} style={smallButton} onClick={() => setOpen(!open)}>
            {open ? "Hide" : "Manage categories"}
          </button>
        </div>

        {open && (
          <div style={{ marginTop: "1rem" }}>
            <div role="group" aria-label="Category type" style={{ display: "flex", gap: "0.5rem", marginBottom: "0.75rem" }}>
              {["expense", "income"].map((t) => (
                <button
                  key={t}
                  type="button"
                  aria-pressed={entryType === t}
                  style={tabStyle(entryType === t)}
                  onClick={() => {
                    setEntryType(t);
                    setAdding(null);
                    setEditing(null);
                    setDeleting(null);
                  }}
                >
                  {t === "expense" ? "Expense" : "Income"}
                </button>
              ))}
            </div>

            {adding && adding.parent === "" ? (
              addForm
            ) : (
              <button type="button" style={primaryButton} onClick={() => startAdd("")}>
                + Add category
              </button>
            )}

            <ul
              aria-label={`${entryType === "expense" ? "Expense" : "Income"} categories`}
              style={{ listStyle: "none", padding: 0, margin: "0.75rem 0 0" }}
            >
              {tops.map((top) => (
                <Fragment key={top.value}>
                  {renderRow(top, false)}
                  {subsOf(top.value).map((sub) => renderRow(sub, true))}
                </Fragment>
              ))}
            </ul>
          </div>
        )}
      </Card>
    </div>
  );
}
