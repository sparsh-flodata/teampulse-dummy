import { useState } from "react";
import { useForm } from "@tanstack/react-form";
import { useNavigate } from "@tanstack/react-router";
import {
  Sparkles,
  ArrowRight,
  Activity,
  Check,
  ShieldCheck,
  Loader2,
} from "lucide-react";
import { z } from "zod";
import { FormError, Logo } from "@/components/ui";
import { bind, errorMessage } from "@/lib/forms";
import { signIn } from "../session";

const loginSchema = z.object({
  email: z.email("Enter your work email."),
  password: z.string().min(1, "Enter your password."),
});

export function LoginPage() {
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const form = useForm({
    defaultValues: { email: "nitish.kumar@flodataanalytics.com", password: "" },
    onSubmit: async ({ value }) => {
      setError("");
      try {
        const { email, password } = loginSchema.parse(value);
        await signIn(email, password);
        await navigate({ to: "/" });
      } catch (e) {
        setError(errorMessage(e));
      }
    },
  });
  return (
    <div className="login-page">
      <div className="login-mobile-brand">
        <Logo />
        <span>Work, in sync.</span>
      </div>
      <div className="login-story">
        <Logo />
        <span className="login-kicker">A calmer way to work together</span>
        <h1>
          Great work starts
          <br />
          with a clear picture.
        </h1>
        <p>
          A shared understanding of what's moving,
          <br />
          what's waiting, and what's possible next.
        </p>
        <div className="login-art">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="orbit orbit-three" />
          <span className="orbit-core">
            <Activity size={45} />
          </span>
          <div className="floating-card float-one">
            <span className="mini-avatar">AR</span>
            <span>
              Dashboard integration<small>In progress · 65%</small>
            </span>
            <span className="tiny-dot" />
          </div>
          <div className="floating-card float-two">
            <Check className="green-text" size={22} />
            <span>
              One less blocker.<small>Your team is moving forward.</small>
            </span>
          </div>
          <div className="floating-card float-three">
            <Sparkles size={18} />
            <span>A little more clarity.</span>
          </div>
        </div>
        <span className="login-bottom">
          Built for people. Designed for progress.
        </span>
      </div>
      <div className="login-form-wrap">
        <div className="login-form">
          <span className="eyebrow">WELCOME TO TEAMPULSE</span>
          <h2>Good to see you.</h2>
          <p>Sign in to find your team's rhythm.</p>
          <form
            className="form"
            onSubmit={(e) => {
              e.preventDefault();
              void form.handleSubmit();
            }}
          >
            <label>
              Work email
              <form.Field name="email">
                {(f) => (
                  <input
                    {...bind(f)}
                    type="email"
                    autoComplete="username"
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
                    autoComplete="current-password"
                    placeholder="Enter your workspace password"
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
                      Sign in
                      <ArrowRight size={17} />
                    </>
                  )}
                </button>
              )}
            </form.Subscribe>
          </form>
          <div className="login-demo">
            <ShieldCheck size={19} />
            <div>
              <strong>Explore the local pilot</strong>
              <p>
                Management: ujjwal@flodataanalytics.com
                <br />
                Manager: nitish.kumar@flodataanalytics.com
                <br />
                Employee: kapil.sharma@flodataanalytics.com
                <br />
                Use the demo password in your local .env file.
              </p>
            </div>
          </div>
          <span className="login-privacy">
            Work visibility, with trust at the center.
          </span>
        </div>
      </div>
    </div>
  );
}
