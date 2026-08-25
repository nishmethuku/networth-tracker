import { useState, type CSSProperties, type InputHTMLAttributes } from "react";
import { Controller, type Control, type FieldPath, type FieldValues } from "react-hook-form";

function formatDisplay(raw: string | number | null | undefined): string {
  if (raw === "" || raw == null) return "";
  const str = String(raw);
  const n = Number(str);
  if (Number.isNaN(n)) return str;
  const [intPart, decPart] = str.split(".");
  const withCommas = Number(intPart || 0).toLocaleString("en-US");
  return decPart !== undefined ? `${withCommas}.${decPart}` : withCommas;
}

interface NumericInputProps<TFieldValues extends FieldValues> extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "style" | "value" | "onChange" | "onBlur" | "onFocus" | "name"
> {
  control: Control<TFieldValues>;
  name: FieldPath<TFieldValues>;
  style?: CSSProperties;
}

/**
 * Displays comma-formatted digits (1,234.56) while the react-hook-form
 * field value stays the raw numeric string ("1234.56") — formatting is a
 * display concern only, never sent to the backend or used in validation.
 */
export default function NumericInput<TFieldValues extends FieldValues>({
  control,
  name,
  style,
  ...props
}: NumericInputProps<TFieldValues>) {
  const [focused, setFocused] = useState(false);

  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <input
          {...props}
          inputMode="decimal"
          value={focused ? (field.value ?? "") : formatDisplay(field.value)}
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
