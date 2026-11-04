import { useState } from "react";
import { useForm } from "@tanstack/react-form";
import { useNavigate } from "@tanstack/react-router";
import { ArrowRight, Loader2 } from "lucide-react";
import { z } from "zod";
import { FormError } from "@/components/ui";
import { bind, errorMessage } from "@/lib/forms";
import { signUp } from "../session";

/** Company domain for self-registration. The server enforces it; this is for a quick hint. */
export const COMPANY_DOMAIN = "flodataanalytics.com";

const registerSchema = z.object({
  name: z.string().trim().min(2, "Enter your full name."),
  email: z
    .email("Enter your work email.")
    .refine(
      (e) => e.toLowerCase().endsWith("@" + COMPANY_DOMAIN),
      `Use your @${COMPANY_DOMAIN} email.`,
    ),
  password: z.string().min(12, "Use at least 12 characters."),
});

export function RegisterForm() {
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const form = useForm({
    defaultValues: { name: "", email: "", password: "" },
    onSubmit: async ({ value }) => {
      setError("");
      try {
        const { name, email, password } = registerSchema.parse(value);
        await signUp(name, email, password);
        await navigate({ to: "/" });
      } catch (e) {
        setError(errorMessage(e));
      }
    },
  });
  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        void form.handleSubmit();
      }}
    >
      <label>
        Full name
        <form.Field name="name">
          {(f) => <input {...bind(f)} autoComplete="name" required />}
        </form.Field>
      </label>
      <label>
        Work email
        <form.Field name="email">
          {(f) => (
            <input
              {...bind(f)}
              type="email"
              autoComplete="username"
              placeholder={"name@" + COMPANY_DOMAIN}
              required
            />
          )}
        </form.Field>
      </label>
      <label>
        Password
        <form.Field name="password">
          {(f) => (
            <input
              {...bind(f)}
              type="password"
              autoComplete="new-password"
              placeholder="At least 12 characters"
              required
            />
          )}
        </form.Field>
      </label>
      <FormError message={error} />
      <form.Subscribe selector={(s) => s.isSubmitting}>
        {(busy) => (
          <button className="button primary" disabled={busy}>
            {busy ? (
              <Loader2 className="spin" size={17} />
            ) : (
              <>
                Create account
                <ArrowRight size={17} />
              </>
            )}
          </button>
        )}
      </form.Subscribe>
    </form>
  );
}
