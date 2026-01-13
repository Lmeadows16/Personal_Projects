"use client";

import { useState } from "react";
import ThemeToggle from "@/components/ThemeToggle";
import { supabase } from "@/lib/supabase";

export default function SettingsPage() {
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [status, setStatus] = useState<string>("");

  async function changePassword() {
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
          <button onClick={changePassword}>Update Password</button>
        </div>
      </div>

      {status ? (
        <div style={{ marginTop: 12, opacity: 0.85 }}>{status}</div>
      ) : null}
    </main>
  );
}
