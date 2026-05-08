import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Obsidian Portfoliyzer",
  description:
    "Automated Buy & Hold Portfolio Management — DCA Strategy, Target Allocation, and Analytics.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark h-full">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
