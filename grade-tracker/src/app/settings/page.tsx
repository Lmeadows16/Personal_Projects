"use client";

import { useState, type FormEvent } from "react";
import ThemeToggle from "@/components/ThemeToggle";
import { supabase } from "@/lib/supabase";

export default function SettingsPage() {
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [status, setStatus] = useState<string>("");
  const [accountStatus, setAccountStatus] = useState<string>("");
  const [deletingAccount, setDeletingAccount] = useState(false);

  async function changePassword(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    setStatus("");
    if (pw1.trim().length < 6) {
      setStatus("Password must be at least 6 characters.");
      return;
    }
    if (pw1 !== pw2) {
      setStatus("Passwords do not match.");
      return;
    }

    const { error } = await supabase.auth.updateUser({ password: pw1 });
    setStatus(error ? error.message : "Password updated.");
    if (!error) {
      setPw1("");
      setPw2("");
    }
  }

  async function deleteAccount() {
    setAccountStatus("");
    if (!confirm("Delete your account forever? This cannot be undone.")) {
      return;
    }

    setDeletingAccount(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        setAccountStatus("Please log in again.");
        return;
      }

      const response = await fetch("/api/delete-account", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setAccountStatus(payload.error ?? "Failed to delete account.");
        return;
      }

      await supabase.auth.signOut();
      window.location.href = "/login";
    } catch (error) {
      setAccountStatus(
        error instanceof Error ? error.message : "Failed to delete account.",
      );
    } finally {
      setDeletingAccount(false);
    }
  }

  return (
    <main style={{ maxWidth: 900, margin: "40px auto", padding: 16 }}>
      <h1 style={{ marginTop: 0 }}>Settings</h1>

      <div
        style={{
          border: "1px solid var(--border)",
          borderRadius: 12,
          padding: 14,
          marginTop: 14,
        }}
      >
        <div style={{ fontWeight: 800, marginBottom: 8 }}>Theme</div>
        <ThemeToggle />
      </div>

      <div
        style={{
          border: "1px solid var(--border)",
          borderRadius: 12,
          padding: 14,
          marginTop: 14,
        }}
      >
        <div style={{ fontWeight: 800, marginBottom: 8 }}>Change Password</div>
        <form onSubmit={changePassword}>
          <input
            type="password"
            value={pw1}
            onChange={(e) => setPw1(e.target.value)}
            placeholder="New password"
            style={{
              width: "100%",
              padding: 10,
              borderRadius: 10,
              border: "1px solid var(--border)",
              background: "transparent",
              color: "inherit",
              marginBottom: 10,
            }}
          />
          <input
            type="password"
            value={pw2}
            onChange={(e) => setPw2(e.target.value)}
            placeholder="Confirm new password"
            style={{
              width: "100%",
              padding: 10,
              borderRadius: 10,
              border: "1px solid var(--border)",
              background: "transparent",
              color: "inherit",
            }}
          />
          <div style={{ marginTop: 10 }}>
            <button type="submit">Update Password</button>
          </div>
        </form>
      </div>

      <div
        style={{
          border: "1px solid var(--border)",
          borderRadius: 12,
          padding: 14,
          marginTop: 14,
        }}
      >
        <div style={{ fontWeight: 800, marginBottom: 8 }}>Delete Account</div>
        <div style={{ opacity: 0.7, marginBottom: 10 }}>
          This permanently deletes your account and sign-in.
        </div>
        <button
          onClick={deleteAccount}
          disabled={deletingAccount}
          style={{
            border: "1px solid rgba(220, 38, 38, 0.6)",
            color: "#dc2626",
            background: "transparent",
            fontWeight: 600,
          }}
        >
          {deletingAccount ? "Deleting..." : "Delete account"}
        </button>
      </div>

      {status ? (
        <div style={{ marginTop: 12, opacity: 0.85 }}>{status}</div>
      ) : null}
      {accountStatus ? (
        <div style={{ marginTop: 12, opacity: 0.85 }}>{accountStatus}</div>
      ) : null}
    </main>
  );
}
