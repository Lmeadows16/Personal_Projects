"use client";

import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState<string>("");
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  const [isRecovery, setIsRecovery] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let mounted = true;

    const searchParams =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search)
        : null;
    const hashParams =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.hash.replace("#", ""))
        : null;

    const recoveryType = searchParams?.get("type") ?? hashParams?.get("type");
    const code = searchParams?.get("code");
    const hasHashTokens = Boolean(
      hashParams?.get("access_token") && hashParams.get("refresh_token"),
    );
    const isRecoveryLink = recoveryType === "recovery" || Boolean(code) || hasHashTokens;
    if (isRecoveryLink) setIsRecovery(true);

    const syncSession = async () => {
      if (!mounted) return;

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (!mounted) return;
        if (error) {
          setStatus(error.message);
        }
      } else if (hasHashTokens) {
        const { error } = await supabase.auth.setSession({
          access_token: hashParams!.get("access_token")!,
          refresh_token: hashParams!.get("refresh_token")!,
        });
        if (!mounted) return;
        if (error) {
          setStatus(error.message);
        }
      }

      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setHasSession(Boolean(data.session));
    };

    void syncSession();

    const { data: subscription } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!mounted) return;
        if (event === "PASSWORD_RECOVERY" || isRecoveryLink) {
          setIsRecovery(true);
          setHasSession(Boolean(session));
          return;
        }

        if (session && !isRecoveryLink) {
          supabase.auth.signOut();
          setHasSession(false);
          setIsRecovery(false);
          setStatus("Open the reset link from your email to continue.");
        }
      },
    );

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  async function updatePassword(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    setStatus("");
    if (!hasSession || !isRecovery) {
      setStatus("Open the reset link from your email to continue.");
      return;
    }

    const trimmedPassword = password.trim();
    const trimmedConfirm = confirmPassword.trim();

    if (trimmedPassword.length < 6) {
      setStatus("Password must be at least 6 characters.");
      return;
    }
    if (trimmedPassword !== trimmedConfirm) {
      setStatus("Passwords do not match.");
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: trimmedPassword,
      });
      if (error) throw error;

      await supabase.auth.signOut();
      setStatus("Password updated. You can log in now.");
      window.location.href = "/login";
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "Unable to update password.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <main style={{ maxWidth: 520, margin: "80px auto", padding: 16 }}>
      <h1 style={{ marginTop: 0, fontSize: 32 }}>Reset your password</h1>
      <div style={{ opacity: 0.7, marginBottom: 20, fontSize: 16 }}>
        Enter a new password for your account.
      </div>

      <form
        onSubmit={updatePassword}
        style={{ display: "flex", flexDirection: "column", gap: 12 }}
      >
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="New password"
          type="password"
          style={{
            padding: 14,
            fontSize: 16,
            borderRadius: 12,
            border: "1px solid var(--border)",
            background: "transparent",
            color: "inherit",
          }}
        />
        <input
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="Confirm new password"
          type="password"
          style={{
            padding: 14,
            fontSize: 16,
            borderRadius: 12,
            border: "1px solid var(--border)",
            background: "transparent",
            color: "inherit",
          }}
        />

        <button
          type="submit"
          disabled={saving}
          style={{ padding: "10px 12px", fontSize: 15 }}
        >
          {saving ? "Updating..." : "Update password"}
        </button>

        {status ? (
          <div style={{ marginTop: 6, opacity: 0.8, fontSize: 14 }}>{status}</div>
        ) : null}
      </form>
    </main>
  );
}
