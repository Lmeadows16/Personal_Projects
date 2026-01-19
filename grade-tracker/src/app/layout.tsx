"use client";

import "./globals.css";
import { ThemeProvider } from "next-themes";
import Sidebar from "@/components/Sidebar";
import { usePathname } from "next/navigation";
import { useState } from "react";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const hideSidebar = pathname.startsWith("/login");
  const [sidebarOpen, setSidebarOpen] = useState(!hideSidebar);

  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <div className="app-shell">
            {!hideSidebar && sidebarOpen ? (
              <Sidebar onToggle={() => setSidebarOpen(false)} />
            ) : null}
            <div className="content">{children}</div>
          </div>
          {!hideSidebar && !sidebarOpen ? (
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="sidebar-toggle-fab"
            >
              Show menu
            </button>
          ) : null}
        </ThemeProvider>
      </body>
    </html>
  );
}
