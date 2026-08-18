'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, ScanLine, Users, User } from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/home', label: 'Home', icon: Home },
  { href: '/scan', label: 'Scan', icon: ScanLine },
  { href: '/contacts', label: 'Contacts', icon: Users },
  { href: '/profile', label: 'Profile', icon: User },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 glass border-t border-white/10">
      <div className="flex items-center justify-around max-w-lg mx-auto">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex flex-col items-center gap-1 px-4 py-3 transition-colors duration-200',
                active ? 'text-brand-400' : 'text-white/40 hover:text-white/70',
              )}
            >
              <Icon size={22} strokeWidth={active ? 2.5 : 1.8} />
              <span className="text-[10px] font-medium">{label}</span>
              {active && <span className="absolute bottom-1 w-1 h-1 rounded-full bg-brand-500" />}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
