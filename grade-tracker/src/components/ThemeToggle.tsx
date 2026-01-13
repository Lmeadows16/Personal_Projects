"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return (
    <select
      value={theme}
      onChange={(e) => setTheme(e.target.value)}
      style={{
        width: "100%",
        padding: 10,
        borderRadius: 10,
        border: "1px solid var(--border)",
        background: "transparent",
        color: "inherit",
      }}
    >
      <option value="system">System</option>
      <option value="light">Light</option>
      <option value="dark">Dark</option>
    </select>
  );
}
