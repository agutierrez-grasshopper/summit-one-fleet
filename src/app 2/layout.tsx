import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'summit-one-fleet',
  description: 'Summit One microservice',
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
