import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Execd — team execution, tracked',
  description: 'Admin console for Execd teams.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{if(localStorage.getItem('execd-theme')==='violet')document.documentElement.dataset.theme='violet'}catch(e){}",
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  )
}
