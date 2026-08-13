import { useState } from "react";
import { Controller } from "react-hook-form";

function formatDisplay(raw) {
  if (raw === "" || raw == null) return "";
  const n = Number(raw);
  if (Number.isNaN(n)) return raw;
  const [intPart, decPart] = raw.split(".");
  const withCommas = Number(intPart || 0).toLocaleString("en-US");
  return decPart !== undefined ? `${withCommas}.${decPart}` : withCommas;
}

/**
 * Displays comma-formatted digits (1,234.56) while the react-hook-form
 * field value stays the raw numeric string ("1234.56") — formatting is a
 * display concern only, never sent to the backend or used in validation.
 */
export default function NumericInput({ control, name, style, ...props }) {
  const [focused, setFocused] = useState(false);

  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <input
          {...props}
          inputMode="decimal"
          value={focused ? field.value : formatDisplay(field.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            field.onBlur();
          }}
          onChange={(e) => {
            const raw = e.target.value.replace(/,/g, "");
            if (raw === "" || /^-?\d*\.?\d*$/.test(raw)) {
              field.onChange(raw);
            }
          }}
          style={style}
        />
      )}
    />
  );
}
