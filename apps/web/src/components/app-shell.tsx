'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useTheme } from 'next-themes';
import {
  ArrowUpRight,
  BarChart3,
  BookOpen,
  ChevronRight,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Settings2,
  ShieldCheck,
  Sparkles,
  Sun,
  Swords,
  UserRound,
  X,
} from 'lucide-react';
import { Brand } from './brand';
import { Button } from './ui/button';
import { useWorkspace } from './workspace-provider';
import { createClient } from '@/lib/supabase/client';
import { ProfileAvatar } from './profile-avatar';
const navigation = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { href: '/arena', label: 'Debate arena', icon: Swords },
  { href: '/history', label: 'Debate history', icon: History },
  { href: '/progress', label: 'Your progress', icon: BarChart3 },
  { href: '/practice', label: 'Practice', icon: BookOpen },
  { href: '/rooms', label: 'Multiplayer', icon: Swords },
  { href: '/tournaments', label: 'Tournaments', icon: ShieldCheck },
  { href: '/leaderboard', label: 'Practice standings', icon: BarChart3 },
];
export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname(),
    [open, setOpen] = useState(false),
    [signingOut, setSigningOut] = useState(false);
  const router = useRouter();
  const sidebar = useRef<HTMLElement>(null),
    menuButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const priorOverflow = document.body.style.overflow;
    const opener = menuButton.current;
    document.body.style.overflow = 'hidden';
    const focusable = () =>
      Array.from(
        sidebar.current?.querySelectorAll<HTMLElement>('a[href],button:not([disabled])') || [],
      ).filter((e) => e.getClientRects().length > 0);
    focusable()[1]?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
      }
      if (event.key === 'Tab') {
        const elements = focusable(),
          first = elements[0],
          last = elements.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener('keydown', keyboard);
    return () => {
      document.body.style.overflow = priorOverflow;
      document.removeEventListener('keydown', keyboard);
      opener?.focus();
    };
  }, [open]);
  const { profile, setApiKey, error, reload } = useWorkspace();
  const { resolvedTheme, setTheme } = useTheme();
  const title =
    navigation.find((n) => path.startsWith(n.href))?.label ||
    (path === '/settings' ? 'Settings' : 'Profile');
  async function signOut() {
    setSigningOut(true);
    setApiKey('');
    const { error } = await createClient().auth.signOut();
    if (error) {
      setSigningOut(false);
      return;
    }
    router.replace('/login');
    router.refresh();
  }
  return (
    <div className="min-h-screen bg-background">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      {open && (
        <button
          aria-label="Close navigation"
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}
      <aside
        ref={sidebar}
        role={open ? 'dialog' : undefined}
        aria-modal={open ? true : undefined}
        className={`sidebar ${open ? 'sidebar-open' : ''}`}
        aria-label="Main navigation"
      >
        <div className="flex items-center justify-between px-6 pt-7 pb-9">
          <Brand onNavigate={() => setOpen(false)} />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setOpen(false)}
            className="lg:hidden"
            aria-label="Close navigation"
          >
            <X />
          </Button>
        </div>
        <p className="nav-caption">WORKSPACE</p>
        <nav className="space-y-1.5 px-3">
          {navigation.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className={`nav-item ${path.startsWith(href) ? 'nav-active' : ''}`}
              aria-current={path.startsWith(href) ? 'page' : undefined}
            >
              <Icon size={18} />
              {label}
              {path.startsWith(href) && <ChevronRight size={15} className="ml-auto" />}
            </Link>
          ))}
        </nav>
        <div className="mx-5 mt-10 rounded-xl border border-border bg-accent/40 p-4">
          <span className="eyebrow flex items-center gap-2">
            <Sparkles size={14} /> A LITTLE, OFTEN
          </span>
          <p className="mt-2 text-sm font-medium leading-relaxed">
            Good arguments are built through practice.
          </p>
          <Link
            href="/arena"
            onClick={() => setOpen(false)}
            className="mt-3 flex items-center gap-1 text-xs font-semibold text-primary"
          >
            Find your next motion <ArrowUpRight size={14} />
          </Link>
        </div>
        <div className="mt-auto px-3 pt-10 pb-4 space-y-1">
          <Link
            href="/settings"
            onClick={() => setOpen(false)}
            className={`nav-item ${path === '/settings' ? 'nav-active' : ''}`}
          >
            <Settings2 size={18} />
            Settings
          </Link>
          <Link
            href="/profile"
            onClick={() => setOpen(false)}
            aria-label="Profile"
            className="flex items-center gap-3 rounded-lg px-3 py-3 hover:bg-accent"
          >
            <ProfileAvatar name={profile?.display_name || 'V'} url={profile?.avatar_url} />
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">
                {profile?.display_name || 'Your account'}
              </span>
              <span className="text-xs text-muted-foreground">Private workspace</span>
            </span>
            <UserRound className="ml-auto size-4 text-muted-foreground" />
          </Link>
        </div>
      </aside>
      <div className="lg:ml-64">
        <header className="sticky top-0 z-20 flex h-[76px] items-center justify-between border-b border-border bg-background/95 px-5 backdrop-blur-sm sm:px-9">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setOpen(true)}
              ref={menuButton}
              className="lg:hidden"
              aria-label="Open navigation"
            >
              <Menu />
            </Button>
            <span className="hidden text-sm text-muted-foreground sm:inline">Workspace</span>
            <ChevronRight size={14} className="hidden text-muted-foreground sm:block" />
            <span className="text-sm font-medium">{title}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="mr-3 hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
              <ShieldCheck size={14} />
              Private by default
            </span>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Toggle color theme"
              onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
            >
              <Sun className="hidden dark:block" />
              <Moon className="dark:hidden" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Sign out"
              disabled={signingOut}
              onClick={() => void signOut()}
            >
              <LogOut />
            </Button>
          </div>
        </header>
        <main id="main-content" className="mx-auto max-w-[1440px] px-5 py-8 sm:px-9 sm:py-10">
          {error && (
            <div className="notice notice-error mb-6" role="alert">
              {error}
              <Button variant="outline" size="sm" onClick={() => void reload()}>
                Retry connection
              </Button>
            </div>
          )}
          {children}
        </main>
        <footer className="mx-5 flex flex-wrap justify-between gap-2 border-t border-border py-6 text-xs text-muted-foreground sm:mx-9">
          <span>Verbalist · Think clearly. Speak with purpose.</span>
          <span>Text + voice / Private practice</span>
        </footer>
      </div>
    </div>
  );
}
