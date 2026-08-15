import type { Metadata } from "next";
import { Inter, Fraunces } from "next/font/google";
import "./globals.css";

// Editorial serif for display type — this is a private journal, not a
// dashboard, and the typography should feel closer to a notebook than an
// analytics tool. Inter carries the interface itself.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
  axes: ["SOFT", "WONK", "opsz"],
});

export const metadata: Metadata = {
  title: "Groundwork",
  description:
    "A private mirror for checking whether you're living consistently with your own stated values.",
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${fraunces.variable}`}>
      <head>
        {/*
          Resolve the theme before first paint. Without this, a light-theme
          user gets a dark flash on every navigation — jarring in a tool
          meant to feel calm. An explicit choice wins over the system
          preference.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var s=localStorage.getItem('vm-theme');var m=window.matchMedia('(prefers-color-scheme: light)').matches;if(s==='light'||(!s&&m)){document.documentElement.dataset.theme='light';}}catch(e){}})();`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
