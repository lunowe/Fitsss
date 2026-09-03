"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ComponentProps, type FormEvent } from "react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * One field of the stacked inset group. 17px text keeps iOS from zooming on
 * focus; the hairline sits inside the parent's 16px inset, like a grouped list.
 */
function Field({ className, ...props }: ComponentProps<"input">) {
  return (
    <div className="pl-4">
      <input
        className={cn(
          "h-[46px] w-full bg-transparent pr-4 text-body text-label outline-none",
          "placeholder:text-label-3 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-tint",
          className,
        )}
        {...props}
      />
    </div>
  );
}

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const isLogin = mode === "login";

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email"));
    const password = String(form.get("password"));
    const result = isLogin
      ? await authClient.signIn.email({ email, password })
      : await authClient.signUp.email({ email, password, name: String(form.get("name")) });
    setPending(false);

    if (result.error) {
      setError(result.error.message ?? "Authentication failed");
      return;
    }
    router.push("/closet");
    router.refresh();
  }

  return (
    <main className="mx-auto flex w-full max-w-[480px] flex-col px-4 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-[calc(env(safe-area-inset-top)+88px)]">
      <header className="text-center">
        <h1 className="text-large-title tracking-[-1px]">Fitsss</h1>
        <p className="mt-1 text-callout text-label-2">
          {isLogin ? "Your closet, one tap away." : "Build a closet you actually wear."}
        </p>
      </header>

      <form className="mt-9" onSubmit={onSubmit} noValidate={false}>
        <div className="overflow-hidden rounded-xl bg-card [&>div+div>input]:border-t [&>div+div>input]:border-separator">
          {isLogin ? null : (
            <Field
              name="name"
              type="text"
              placeholder="Name"
              required
              autoComplete="name"
              autoCapitalize="words"
              enterKeyHint="next"
            />
          )}
          <Field
            name="email"
            type="email"
            inputMode="email"
            placeholder="Email"
            required
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="next"
          />
          <Field
            name="password"
            type="password"
            placeholder="Password"
            required
            minLength={8}
            autoComplete={isLogin ? "current-password" : "new-password"}
            enterKeyHint="go"
          />
        </div>

        {error ? (
          <p role="alert" className="mt-2.5 px-1 text-footnote text-destructive">
            {error}
          </p>
        ) : null}

        <Button type="submit" className="mt-5 w-full" disabled={pending}>
          {pending ? (isLogin ? "Signing in…" : "Creating account…") : isLogin ? "Sign in" : "Create account"}
        </Button>
      </form>

      <p className="mt-6 text-center text-callout text-label-2">
        {isLogin ? "New here? " : "Already have an account? "}
        <Link className="text-tint active:opacity-60" href={isLogin ? "/register" : "/login"}>
          {isLogin ? "Create an account" : "Sign in"}
        </Link>
      </p>
    </main>
  );
}
