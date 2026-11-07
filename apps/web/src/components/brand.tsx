import { AudioLines } from 'lucide-react';
import Link from 'next/link';
export function Brand({ light = false, onNavigate }: { light?: boolean; onNavigate?: () => void }) {
  return (
    <Link
      href="/dashboard"
      onClick={onNavigate}
      className={`flex items-center gap-2.5 text-xl font-semibold tracking-tight ${light ? 'text-white' : ''}`}
      aria-label="Verbalist home"
    >
      <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-white">
        <AudioLines size={21} strokeWidth={2.3} />
      </span>
      verbalist<span className="text-primary">.</span>
    </Link>
  );
}
