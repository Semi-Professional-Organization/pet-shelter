import type { Metadata } from "next";
import { Geist, Geist_Mono, Playfair_Display } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { LanguageProvider } from "@/components/providers/LanguageProvider";
import { DonationQrProvider } from "@/components/providers/DonationQrProvider";
import { getDonationQrConfig } from "@/lib/domain/donationQrConfig";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

// 1. Heading Font
const playfairDisplayHeading = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-heading",
  display: "swap",
});

// 2. Primary Body & UI Font
const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

// 3. Technical & Metric Mono Font
const geistMono = Geist_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Hope for Strays | Animal Rescue & Adoption (Petaling Jaya, Selangor)",
  description:
    "Hope for Strays is a non-profit animal shelter in Petaling Jaya, Selangor. Adopt rescued dogs, cats, and kittens with complete veterinary care and vaccination.",
  manifest: "/manifest.json",
  other: {
    "msapplication-config": "/browserconfig.xml",
  },
  icons: {
    icon: [
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-96x96.png", sizes: "96x96", type: "image/png" },
    ],
    apple: "/apple-icon-180x180.png",
    other: {
      rel: "apple-touch-icon-precomposed",
      url: "/apple-icon-precomposed.png",
    },
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Read once here so the client donation surfaces — two of which (Navbar,
  // and the /donate page) live inside this layout — all see the same
  // server-side QR configuration.
  const donationQr = await getDonationQrConfig();

  return (
    <html
      lang="en"
      suppressHydrationWarning
      data-scroll-behavior="smooth"
      className={cn(
        "h-full antialiased",
        geistSans.variable,
        geistMono.variable,
        playfairDisplayHeading.variable
      )}
    >
      <head>
        <script
          id="theme-init"
          dangerouslySetInnerHTML={{
            __html: `
              try {
                const storedTheme = localStorage.getItem('hope_for_strays_theme');
                const isDark = storedTheme === 'dark' || (!storedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches);
                if (isDark) {
                  document.documentElement.classList.add('dark');
                } else {
                  document.documentElement.classList.remove('dark');
                }
              } catch (e) {}
            `,
          }}
        />
      </head>
      <body className="m-0 min-h-full bg-frame text-foreground font-sans">
        <LanguageProvider defaultLanguage="en">
          <ThemeProvider defaultTheme="system" storageKey="hope_for_strays_theme">
            <DonationQrProvider value={donationQr}>
              {/* Centered Application Frame with Softer Gray Tones */}
              <div className="w-full border border-frame-border bg-frame-panel shadow-xs flex flex-col min-h-screen">
                <Navbar />
                <main className="flex-1 w-full">{children}</main>
                <Footer />
              </div>
              <Analytics />
              <SpeedInsights />
            </DonationQrProvider>
          </ThemeProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
