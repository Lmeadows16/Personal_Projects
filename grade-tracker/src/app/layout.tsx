"use client";

import "./globals.css";
import { ThemeProvider } from "next-themes";
import Sidebar from "@/components/Sidebar";
import { usePathname } from "next/navigation";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const hideSidebar = pathname.startsWith("/login");

  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <div className="app-shell">
            {!hideSidebar ? <Sidebar /> : null}
            <div className="content">{children}</div>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
