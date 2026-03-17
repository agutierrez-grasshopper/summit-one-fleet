import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Summit One Fleet',
  description: 'Fleet management service — Summit One ecosystem',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
