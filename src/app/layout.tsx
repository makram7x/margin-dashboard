import type { Metadata } from "next";
import { Suspense } from "react";
import { Nav } from "@/components/Nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "Margin — did we make money?",
  description: "Project margin, productivity and cost dashboard built from the agency's timesheets, salaries and project prices.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="topbar">
          <div className="topbar-inner">
            <a href="/" className="brand" aria-label="Margin dashboard home">
              <span className="brand-mark" aria-hidden>M</span>
              Margin
            </a>
            <Suspense>
              <Nav />
            </Suspense>
          </div>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
