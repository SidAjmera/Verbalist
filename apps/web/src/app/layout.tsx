import type { Metadata } from 'next';
import { ThemeProvider } from '@/components/theme-provider';
import './globals.css';
export const metadata: Metadata = {
  title: { default: 'Verbalist — A stronger point of view', template: '%s | Verbalist' },
  description:
    'A private space to sharpen your reasoning through structured debates. Text debate, real opponents powered by your choice of AI, and progress that follows you.',
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
