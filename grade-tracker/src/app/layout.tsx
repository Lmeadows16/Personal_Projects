"use client";

import "./globals.css";
import { ThemeProvider } from "next-themes";
import Sidebar from "@/components/Sidebar";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const hideSidebar = pathname.startsWith("/login");
  const [sidebarOpen, setSidebarOpen] = useState(!hideSidebar);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 900px)");
    const syncMobile = () => setIsMobile(mediaQuery.matches);
    syncMobile();
    mediaQuery.addEventListener("change", syncMobile);
    return () => mediaQuery.removeEventListener("change", syncMobile);
  }, []);

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
          {!hideSidebar && !sidebarOpen && isMobile ? (
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
