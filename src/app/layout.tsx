import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Reliance Matrix — Strategic Offsite 2026',
  description: 'Live interactive quiz for the Reliance Matrix Strategic Offsite 2026',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
      </head>
      <body className="bg-grid min-h-screen" style={{ fontFamily: "'Inter', system-ui, -apple-system, sans-serif" }}>
        {children}
      </body>
    </html>
  );
}
