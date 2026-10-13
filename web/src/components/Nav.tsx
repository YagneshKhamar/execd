'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'

export interface NavItem {
  href: string
  label: string
}

/** Top navigation that keeps the selected organization (?org=) across dashboard pages. */
export default function Nav({ items, keepOrg }: { items: NavItem[]; keepOrg?: boolean }) {
  const pathname = usePathname()
  const org = useSearchParams().get('org')
  return (
    <nav>
      {items.map((item) => {
        const href = keepOrg && org ? `${item.href}?org=${org}` : item.href
        return (
          <Link
            key={item.href}
            href={href}
            className={item.href === pathname ? 'active' : ''}
          >
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
