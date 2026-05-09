import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";

export const metadata: Metadata = {
  title: "Obsidian Portfoliyzer",
  description: "Automated Buy & Hold Portfolio Management — DCA Strategy, Target Allocation, and Analytics.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Portfoliyzer",
  },
  formatDetection: {
    telephone: false,
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark h-full">
      <body className="min-h-full flex flex-col">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
