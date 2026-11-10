import { z } from "zod";

/** User-facing message for a failed submit (zod issue or API error). */
export function errorMessage(error: unknown): string {
  if (error instanceof z.ZodError)
    return error.issues[0]?.message ?? "Please check the form.";
  return error instanceof Error ? error.message : "Something went wrong.";
}

/** Form inputs hold strings; these coerce them into API values. */
export const numberField = (min: number, max: number, label: string) =>
  z.coerce
    .number({ error: `${label} must be a number.` })
    .min(min, `${label} must be at least ${min}.`)
    .max(max, `${label} must be at most ${max}.`);

/** Whole numbers only (the API stores progress as an integer percentage). */
export const wholeNumberField = (min: number, max: number, label: string) =>
  z.coerce
    .number({ error: `${label} must be a number.` })
    .int(`${label} must be a whole number.`)
    .min(min, `${label} must be at least ${min}.`)
    .max(max, `${label} must be at most ${max}.`);

export const optionalNumberField = (
  min: number,
  max: number,
  label: string,
  whole = false,
) =>
  z.string().transform((v, ctx) => {
    if (v.trim() === "") return null;
    const n = Number(v);
    if (
      Number.isNaN(n) ||
      n < min ||
      n > max ||
      (whole && !Number.isInteger(n))
    ) {
      ctx.addIssue({
        code: "custom",
        message: `${label} must be between ${min} and ${max}.`,
      });
      return z.NEVER;
    }
    return n;
  });

type StringField = {
  name: string;
  state: { value: string };
  handleChange: (value: string) => void;
  handleBlur: () => void;
};

/** Binds a TanStack Form string field to an input/select/textarea. */
export const bind = (field: StringField) => ({
  name: field.name,
  value: field.state.value,
  onChange: (e: { target: { value: string } }) =>
    field.handleChange(e.target.value),
  onBlur: field.handleBlur,
});

/** "" (no selection) -> null, otherwise a numeric id. */
export const optionalId = z
  .union([z.string(), z.number()])
  .transform((v) => (v === "" ? null : Number(v)));
