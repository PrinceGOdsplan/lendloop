import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { ConvexClientProvider } from "@/components/ConvexClientProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "LendLoop · Borrow what you need. Lend what you don’t.", template: "%s · LendLoop" },
  openGraph: {
    title: "LendLoop",
    description: "A neighbourhood tool library. Borrow what you need. Lend what you don’t.",
  },
  description: "A neighbourhood tool-lending board.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-stone-50 text-stone-900 antialiased">
        <ClerkProvider
          appearance={{
            variables: {
              colorPrimary: "#047857",
              colorForeground: "#1c1917",
              borderRadius: "0.625rem",
              fontFamily: "inherit",
            },
          }}
        >
          <ConvexClientProvider>{children}</ConvexClientProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
