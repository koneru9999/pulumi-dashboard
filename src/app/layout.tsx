import type { Metadata } from 'next'
import { Inter, JetBrains_Mono } from "next/font/google";
import { TooltipProvider } from '@/components/ui/tooltip'
import "./globals.css";

const fontSans = Inter({
    subsets: ["latin"],
    variable: "--font-sans",
});

const fontMono = JetBrains_Mono({
    subsets: ["latin"],
    variable: "--font-mono",
});

export const metadata: Metadata = {
  title: 'Pulumi Dashboard',
  description: 'View your Pulumi stack outputs and resources in a beautiful dashboard.',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${fontSans.variable} ${fontMono.variable} antialiased`}
      >
        <script
          // biome-ignore lint/security/noDangerouslySetInnerHtml: FOUC prevention inline script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('theme');if(t==='dark'||(t!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch(e){}`,
          }}
        />
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  )
}
