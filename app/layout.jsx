import './globals.css';
import '../client/src/styles.css';

export const metadata = {
  title: 'Zotrix Research Private Ltd | Project Operations',
  description: 'Project operations, workforce, attendance and expense management.'
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}