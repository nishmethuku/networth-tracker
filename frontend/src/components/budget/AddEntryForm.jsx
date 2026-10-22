import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import NumericInput from "../NumericInput";
import { useToast } from "../../contexts/ToastContext";
import { useHousehold } from "../../contexts/HouseholdContext";
import { createBudgetCategory, createBudgetEntry, fetchHoldings, fetchLiabilities, ApiError } from "../../api";
import { getBudgetCategoryLabel, getAssetTypeLabel, CURRENCIES } from "../../constants/enums";
import { formatCurrencyForDisplay, todayISO } from "../../utils/formatters";
import { orderCategoryOptions } from "../../utils/categoryTree";

const RECURRING_FREQUENCIES = [
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "yearly", label: "Yearly" },
];

const inputStyle = {
  padding: "0.625rem 0.875rem",
  borderRadius: "var(--radius)",
  border: "1px solid var(--border)",
  background: "var(--bg)",
  color: "var(--text)",
  fontSize: "0.875rem",
  width: "100%",
};

/** The full income and expense form (used on the Expenses page). */
export default function AddEntryForm({ categories, currency }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { currentHouseholdId } = useHousehold();
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const { register, control, watch, setValue, handleSubmit, reset } = useForm({
    defaultValues: {
      entry_type: "expense",
      category: categories?.expense?.[0] || "",
      amount: "",
      entry_date: todayISO(),
      description: "",
      currency,
      is_recurring: false,
      recurring_frequency: "monthly",
      funding_source_holding_id: "",
      linked_liability_id: "",
      deposit_target_holding_id: "",
    },
  });
  const entryType = watch("entry_type");
  const categoryValue = watch("category");
  const isRecurring = watch("is_recurring");
  const categoryOptions = useMemo(
    () => (entryType === "income" ? categories?.income || [] : categories?.expense || []),
    [entryType, categories],
  );
  const parentMap = categories?.parents?.[entryType] || {};
  const orderedOptions = useMemo(
    () => orderCategoryOptions(categoryOptions, parentMap, getBudgetCategoryLabel),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [categoryOptions, categories, entryType],
  );
  const [newCategoryParent, setNewCategoryParent] = useState("");

  // Regression: defaultValues.category was captured once at mount
  // (categories?.expense?.[0]) -- if the categories query hadn't
  // resolved yet, that was "", and it stayed "" forever once the query
  // did resolve (a useForm default isn't reactive), leaving the select
  // matching no option and an entry submitted with a blank category.
  // Also covers switching the Income/Expense tab, which swaps
  // categoryOptions out from under whatever was previously selected.
  useEffect(() => {
    if (categoryOptions.length > 0 && !categoryOptions.includes(categoryValue)) {
      setValue("category", categoryOptions[0]);
    }
  }, [categoryOptions, categoryValue, setValue]);

  // Cash accounts to pay an expense out of — picking one adjusts that
  // account's balance automatically instead of updating it by hand later.
  // Same mechanism as funding a holding purchase from cash.
  const { data: cashHoldings } = useQuery({
    queryKey: ["holdings", "cash"],
    queryFn: () => fetchHoldings({ assetType: "cash", summary: true }),
    enabled: entryType === "expense",
  });

  // Every holding, to deposit income "into" -- a cash target's balance
  // actually gets bumped (same mechanism as the funding source above); a
  // non-cash target (a stock/brokerage account) just tags the entry for
  // record-keeping, since it has no stored balance to add to.
  const { data: depositTargets } = useQuery({
    queryKey: ["holdings", "all"],
    queryFn: () => fetchHoldings({ summary: true }),
    enabled: entryType === "income",
  });

  // Liabilities this expense can pay down — picking one reduces that
  // liability's balance automatically instead of a separate manual edit,
  // same mechanism as the cash-funding-source field above.
  const { data: liabilities } = useQuery({
    queryKey: ["liabilities", currency],
    queryFn: () => fetchLiabilities({ currency }),
    enabled: entryType === "expense",
  });

  // Credit cards are something you charge a purchase to. Their bills are paid from the
  // Liabilities page, so "Pays down" lists only the other kinds (a card bill logged as an
  // expense would count the same spending twice).
  const cards = (liabilities || []).filter((l) => l.liabilityType === "credit_card" || l.liabilityType === "line_of_credit");
  const payable = (liabilities || []).filter((l) => l.liabilityType !== "credit_card" && l.liabilityType !== "line_of_credit");

  const mutation = useMutation({
    mutationFn: (data) =>
      createBudgetEntry({
        entry_type: data.entry_type,
        entry_date: data.entry_date,
        amount: parseFloat(data.amount),
        currency: data.currency,
        category: data.category,
        description: data.description || null,
        is_recurring: data.is_recurring,
        recurring_frequency: data.is_recurring ? data.recurring_frequency : null,
        ...(data.entry_type === "expense" && data.funding_source_holding_id
          ? String(data.funding_source_holding_id).startsWith("card:")
            ? { charge_liability_id: Number(String(data.funding_source_holding_id).slice(5)) }
            : { funding_source_holding_id: Number(data.funding_source_holding_id) }
          : {}),
        ...(data.entry_type === "expense" && data.linked_liability_id ? { linked_liability_id: Number(data.linked_liability_id) } : {}),
        ...(data.entry_type === "income" && data.deposit_target_holding_id
          ? { deposit_target_holding_id: Number(data.deposit_target_holding_id) }
          : {}),
      }),
    onSuccess: (entry) => {
      queryClient.invalidateQueries({ queryKey: ["budget-entries"] });
      queryClient.invalidateQueries({ queryKey: ["budget-summary"] });
      queryClient.invalidateQueries({ queryKey: ["budget-subscriptions"] });
      if (entry.fundingSource) {
        // String(...): matches HoldingDetail's useParams()-keyed (string) cache.
        queryClient.invalidateQueries({ queryKey: ["holding", String(entry.fundingSource.holdingId)] });
        queryClient.invalidateQueries({ queryKey: ["holding-valuations", String(entry.fundingSource.holdingId)] });
        queryClient.invalidateQueries({ queryKey: ["holdings"] });
        toast.success(
          `Expense added — account balance updated to ${formatCurrencyForDisplay(entry.fundingSource.newBalance, entry.fundingSource.currency, { includeCode: false })}`,
        );
      } else if (entry.chargedLiability) {
        queryClient.invalidateQueries({ queryKey: ["liabilities"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard"] });
        toast.success(
          `Expense added — card balance now ${formatCurrencyForDisplay(entry.chargedLiability.newBalance, entry.chargedLiability.currency, { includeCode: false })}`,
        );
      } else if (entry.linkedLiability) {
        queryClient.invalidateQueries({ queryKey: ["liabilities"] });
        toast.success(
          `Expense added — liability balance updated to ${formatCurrencyForDisplay(entry.linkedLiability.newBalance, entry.linkedLiability.currency, { includeCode: false })}`,
        );
      } else if (entry.depositTarget) {
        queryClient.invalidateQueries({ queryKey: ["holding", String(entry.depositTarget.holdingId)] });
        queryClient.invalidateQueries({ queryKey: ["holding-valuations", String(entry.depositTarget.holdingId)] });
        queryClient.invalidateQueries({ queryKey: ["holdings"] });
        toast.success(
          `Income added — account balance updated to ${formatCurrencyForDisplay(entry.depositTarget.newBalance, entry.depositTarget.currency, { includeCode: false })}`,
        );
      } else if (entry.depositTargetHoldingId) {
        // A non-cash deposit target (e.g. a stock account) has no balance
        // to bump -- the entry is tagged with it, nothing more.
        const target = (depositTargets || []).find((h) => h.id === entry.depositTargetHoldingId);
        const label = target ? target.symbol || target.name : "the selected account";
        toast.success(`Income added — tagged to ${label}`);
      } else {
        toast.success(entryType === "income" ? "Income added" : "Expense added");
      }
      reset({
        entry_type: entryType,
        category: categoryOptions[0] || "",
        amount: "",
        entry_date: todayISO(),
        description: "",
        currency,
        is_recurring: false,
        recurring_frequency: "monthly",
        funding_source_holding_id: "",
        linked_liability_id: "",
        deposit_target_holding_id: "",
      });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Failed to add entry"),
  });

  const createCategoryMutation = useMutation({
    mutationFn: () =>
      createBudgetCategory({
        entry_type: entryType,
        name: newCategoryName.trim(),
        household_id: currentHouseholdId,
        ...(newCategoryParent ? { parent: newCategoryParent } : {}),
      }),
    onSuccess: (category) => {
      queryClient.invalidateQueries({ queryKey: ["budget-categories"] });
      setValue("category", category.name);
      setAddingCategory(false);
      setNewCategoryName("");
      setNewCategoryParent("");
      toast.success(`"${category.name}" category added`);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Failed to add category"),
  });

  return (
    <form onSubmit={handleSubmit((data) => mutation.mutate(data))}>
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
        <button
          type="button"
          onClick={() => {
            setValue("entry_type", "income");
            setValue("category", categories?.income?.[0] || "");
          }}
          style={{
            ...inputStyle,
            cursor: "pointer",
            background: entryType === "income" ? "var(--success-light)" : "var(--bg)",
            color: entryType === "income" ? "var(--success)" : "var(--text)",
            fontWeight: 600,
          }}
        >
          + Income
        </button>
        <button
          type="button"
          onClick={() => {
            setValue("entry_type", "expense");
            setValue("category", categories?.expense?.[0] || "");
          }}
          style={{
            ...inputStyle,
            cursor: "pointer",
            background: entryType === "expense" ? "var(--danger-light)" : "var(--bg)",
            color: entryType === "expense" ? "var(--danger)" : "var(--text)",
            fontWeight: 600,
          }}
        >
          − Expense
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "0.75rem" }}>
        <div>
          <label
            htmlFor="budget-amount"
            style={{ fontSize: "0.75rem", color: "var(--text-secondary)", display: "block", marginBottom: "0.25rem" }}
          >
            Amount
          </label>
          <NumericInput id="budget-amount" control={control} name="amount" style={inputStyle} />
        </div>
        <div>
          <label
            htmlFor="budget-category"
            style={{ fontSize: "0.75rem", color: "var(--text-secondary)", display: "block", marginBottom: "0.25rem" }}
          >
            Category
          </label>
          <select
            id="budget-category"
            {...register("category")}
            value={addingCategory ? "__new__" : categoryValue}
            onChange={(e) => {
              if (e.target.value === "__new__") {
                setAddingCategory(true);
                return;
              }
              setValue("category", e.target.value);
            }}
            style={inputStyle}
          >
            {orderedOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
            <option value="__new__">+ New category…</option>
          </select>
          {addingCategory && (
            <div style={{ display: "flex", gap: "0.4rem", marginTop: "0.4rem" }}>
              <input
                autoFocus
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="e.g., Pet care"
                aria-label="New category name"
                style={{ ...inputStyle, flex: 1 }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (newCategoryName.trim()) createCategoryMutation.mutate();
                  }
                }}
              />
              <select
                aria-label="Put the new category inside"
                value={newCategoryParent}
                onChange={(e) => setNewCategoryParent(e.target.value)}
                style={{ ...inputStyle, flex: "0 1 9rem" }}
              >
                <option value="">Top level</option>
                {orderedOptions
                  .filter((o) => !o.parent)
                  .map((o) => (
                    <option key={o.value} value={o.value}>
                      Inside {o.label}
                    </option>
                  ))}
              </select>
              <button
                type="button"
                onClick={() => newCategoryName.trim() && createCategoryMutation.mutate()}
                disabled={createCategoryMutation.isPending || !newCategoryName.trim()}
                style={{
                  padding: "0.5rem 0.75rem",
                  borderRadius: "var(--radius-sm)",
                  border: "none",
                  background: "var(--primary)",
                  color: "var(--text-inverse)",
                  cursor: "pointer",
                  fontSize: "0.8125rem",
                  fontWeight: 600,
                  opacity: createCategoryMutation.isPending || !newCategoryName.trim() ? 0.6 : 1,
                }}
              >
                {createCategoryMutation.isPending ? "Adding…" : "Add"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setAddingCategory(false);
                  setNewCategoryName("");
                  setValue("category", categoryOptions[0] || "");
                }}
                style={{
                  padding: "0.5rem 0.75rem",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border)",
                  background: "var(--card)",
                  color: "var(--text-secondary)",
                  cursor: "pointer",
                  fontSize: "0.8125rem",
                }}
              >
                Cancel
              </button>
            </div>
          )}
        </div>
        <div>
          <label
            htmlFor="budget-entry-date"
            style={{ fontSize: "0.75rem", color: "var(--text-secondary)", display: "block", marginBottom: "0.25rem" }}
          >
            Date
          </label>
          <input id="budget-entry-date" type="date" {...register("entry_date")} max={todayISO()} style={inputStyle} />
        </div>
        <div>
          <label
            htmlFor="budget-currency"
            style={{ fontSize: "0.75rem", color: "var(--text-secondary)", display: "block", marginBottom: "0.25rem" }}
          >
            Currency
          </label>
          <select id="budget-currency" {...register("currency")} style={inputStyle}>
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        {entryType === "expense" && (cashHoldings?.length > 0 || cards.length > 0) && (
          <div>
            <label
              htmlFor="budget-funding-source"
              style={{ fontSize: "0.75rem", color: "var(--text-secondary)", display: "block", marginBottom: "0.25rem" }}
            >
              Paid from
            </label>
            <select
              id="budget-funding-source"
              {...register("funding_source_holding_id")}
              style={inputStyle}
              title="Deducts this expense from the selected account's balance, or adds it to the selected credit card's balance"
            >
              <option value="">— none —</option>
              {(cashHoldings || []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.account ? ` (${c.account})` : ""}
                </option>
              ))}
              {cards.map((l) => (
                <option key={`card-${l.id}`} value={`card:${l.id}`}>
                  {l.name} (credit card)
                </option>
              ))}
            </select>
          </div>
        )}
        {entryType === "expense" && payable.length > 0 && (
          <div>
            <label
              htmlFor="budget-linked-liability"
              style={{ fontSize: "0.75rem", color: "var(--text-secondary)", display: "block", marginBottom: "0.25rem" }}
            >
              Pays down
            </label>
            <select
              id="budget-linked-liability"
              {...register("linked_liability_id")}
              style={inputStyle}
              title="Reduces the selected liability's balance by this expense amount"
            >
              <option value="">— none —</option>
              {payable.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
        )}
        {entryType === "income" && depositTargets?.length > 0 && (
          <div>
            <label
              htmlFor="budget-deposit-target"
              style={{ fontSize: "0.75rem", color: "var(--text-secondary)", display: "block", marginBottom: "0.25rem" }}
            >
              Deposit into
            </label>
            <select
              id="budget-deposit-target"
              {...register("deposit_target_holding_id")}
              style={inputStyle}
              title="Adds this income to the selected account's balance (cash accounts) or just tags this entry with it (any other account type)"
            >
              <option value="">— none —</option>
              {depositTargets.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.symbol || h.name}
                  {h.account ? ` (${h.account})` : ""}
                  {h.assetType !== "cash" ? ` · ${getAssetTypeLabel(h.assetType)}` : ""}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div style={{ marginTop: "0.75rem" }}>
        <label
          htmlFor="budget-description"
          style={{ fontSize: "0.75rem", color: "var(--text-secondary)", display: "block", marginBottom: "0.25rem" }}
        >
          Description (optional)
        </label>
        <input
          id="budget-description"
          {...register("description")}
          placeholder={entryType === "income" ? "e.g., August paycheck" : "e.g., Groceries"}
          style={inputStyle}
        />
      </div>

      <div style={{ marginTop: "0.875rem", display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
        <label
          style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.8125rem", color: "var(--text)", cursor: "pointer" }}
        >
          <input type="checkbox" {...register("is_recurring")} />
          Recurring (subscription, rent, bill, etc.)
        </label>
        {isRecurring && (
          <select aria-label="Repeat frequency" {...register("recurring_frequency")} style={{ ...inputStyle, width: "auto" }}>
            {RECURRING_FREQUENCIES.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        )}
      </div>

      <button
        type="submit"
        disabled={mutation.isPending}
        style={{
          marginTop: "1rem",
          padding: "0.75rem 1.5rem",
          borderRadius: "var(--radius)",
          border: "none",
          background: "var(--primary)",
          color: "var(--text-inverse)",
          cursor: "pointer",
          fontWeight: 600,
        }}
      >
        {mutation.isPending ? "Adding..." : `Add ${entryType === "income" ? "Income" : "Expense"}`}
      </button>
    </form>
  );
}
