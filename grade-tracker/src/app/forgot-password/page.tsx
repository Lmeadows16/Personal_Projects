"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("");
  const [sending, setSending] = useState(false);

  async function sendReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("");

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setStatus("Enter your email to reset your password.");
      return;
    }

    setSending(true);
    try {
      const redirectTo =
        typeof window !== "undefined"
          ? `${window.location.origin}/reset-password`
          : undefined;

      const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
        redirectTo,
      });
      if (error) throw error;
      setStatus("Password reset email sent. Check your inbox.");
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Unable to send reset email.",
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <main style={{ maxWidth: 520, margin: "80px auto", padding: 16 }}>
      <h1 style={{ marginTop: 0, fontSize: 32 }}>Forgot your password?</h1>
      <div style={{ opacity: 0.7, marginBottom: 20, fontSize: 16 }}>
        We’ll email you a link to reset it.
      </div>

      <form
        onSubmit={sendReset}
        style={{ display: "flex", flexDirection: "column", gap: 12 }}
      >
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          type="email"
          style={{
            padding: 14,
            fontSize: 16,
            borderRadius: 12,
            border: "1px solid var(--border)",
            background: "transparent",
            color: "inherit",
          }}
        />

        <button type="submit" disabled={sending} style={{ padding: "10px 12px" }}>
          {sending ? "Sending..." : "Send reset link"}
        </button>

        <Link href="/login" style={{ fontSize: 14, opacity: 0.8 }}>
          Back to login
        </Link>

        {status ? (
          <div style={{ marginTop: 6, opacity: 0.8, fontSize: 14 }}>{status}</div>
        ) : null}
      </form>
    </main>
  );
}
