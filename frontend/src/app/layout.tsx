import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export const metadata: Metadata = {
  title: 'Experiment Board',
  description: 'Доска результатов экспериментов Workshop IAS',
}

function readLocalCss(path: string) {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

const inlineStyles = [
  readLocalCss('node_modules/tldraw/tldraw.css'),
  readLocalCss('src/app/globals.css'),
].join('\n')

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode
}>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <style
          id="workshop-inline-styles"
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: inlineStyles }}
        />
        {children}
      </body>
    </html>
  )
}
