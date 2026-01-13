"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [msg, setMsg] = useState<string>("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // If already logged in, middleware will redirect to /
    // This is just for UX if client-side navigations happen.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) window.location.href = "/";
    });
  }, []);

  async function submit() {
    setMsg("");
    setLoading(true);

    try {
      const trimmedEmail = email.trim();
      const trimmedPassword = password.trim();

      if (mode === "signup") {
        const trimmedFirstName = firstName.trim();
        const trimmedLastName = lastName.trim();
        if (!trimmedFirstName || !trimmedLastName || !trimmedEmail || !trimmedPassword) {
          setMsg("First name, last name, email, and password are required.");
          return;
        }

        const redirectTo =
          typeof window !== "undefined"
            ? `${window.location.origin}/login`
            : undefined;

        const { data, error } = await supabase.auth.signUp({
          email: trimmedEmail,
          password: trimmedPassword,
          options: {
            emailRedirectTo: redirectTo,
            data: {
              first_name: trimmedFirstName,
              last_name: trimmedLastName,
            },
          },
        });
        if (error) throw error;

        if (data.user?.id) {
          const { error: profileError } = await supabase.from("profiles").upsert({
            user_id: data.user.id,
            first_name: trimmedFirstName,
            last_name: trimmedLastName,
          });
          if (profileError) {
            console.warn("Profile save failed:", profileError.message);
          }
        }

        setMsg("Account created. Check your email to confirm before logging in.");
        setMode("login");
        setFirstName("");
        setLastName("");
        setPassword("");
        setEmail("");
      } else {
        if (!trimmedEmail || !trimmedPassword) {
          setMsg("Email and password are required.");
          return;
        }

        const { error } = await supabase.auth.signInWithPassword({
          email: trimmedEmail,
          password: trimmedPassword,
        });
        if (error) throw error;
        window.location.href = "/";
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : typeof error === "object" && error && "message" in error
            ? String((error as { message?: unknown }).message ?? "Auth error")
            : "Auth error";
      setMsg(message);
    } finally {
      setLoading(false);
    }
  }

  return (
      <main style={{ maxWidth: 520, margin: "80px auto", padding: 16 }}>
        <h1 style={{ marginTop: 0, fontSize: 36 }}>See My Grades</h1>
        <div style={{ opacity: 0.7, marginBottom: 22, fontSize: 16 }}>
          {mode === "login" ? "Log in to continue" : "Create an account"}
        </div>

        <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
          <button
            onClick={() => setMode("login")}
            style={{ padding: "12px 14px", opacity: mode === "login" ? 1 : 0.6, fontSize: 16 }}
          >
            Login
          </button>
          <button
            onClick={() => setMode("signup")}
            style={{ padding: "12px 14px", opacity: mode === "signup" ? 1 : 0.6, fontSize: 16 }}
          >
            Sign up
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {mode === "signup" ? (
            <>
              <input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="First name"
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
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Last name"
                style={{
                  padding: 14,
                  fontSize: 16,
                  borderRadius: 12,
                  border: "1px solid var(--border)",
                  background: "transparent",
                  color: "inherit",
                }}
              />
            </>
          ) : null}
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
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
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
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
            onClick={submit}
            disabled={loading}
            style={{ padding: "10px 12px", fontSize: 15 }}
          >
            {loading
              ? "Working..."
              : mode === "login"
                ? "Login"
                : "Create account"}
          </button>

          {msg ? <div style={{ marginTop: 6, opacity: 0.8, fontSize: 14 }}>{msg}</div> : null}
        </div>
      </main>

  );
}
