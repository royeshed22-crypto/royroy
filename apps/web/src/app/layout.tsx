import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { Toaster } from 'sonner';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'DUGRIZZ — AI Dating Coach',
  description: 'Decode every conversation. Know when to move.',
  manifest: '/manifest.json',
};

export const viewport: Viewport = {
  themeColor: '#0A0A0F',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={inter.variable}>
        {children}
        <Toaster
          theme="dark"
          position="top-center"
          toastOptions={{
            style: { background: '#1A1A2E', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' },
          }}
        />
      </body>
    </html>
  );
}
