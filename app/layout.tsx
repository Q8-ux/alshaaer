import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "أنت الشاعر",
  description:
    "حوّل قصتك إلى أبيات شعر نبطي أصيلة، مع تحليل المعنى وفحص البحر والقافية.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
