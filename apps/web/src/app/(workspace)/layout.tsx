import { redirect } from 'next/navigation';
import { configured } from '@/lib/supabase/client';
import { createClient } from '@/lib/supabase/server';
import { WorkspaceProvider } from '@/components/workspace-provider';
import { AppShell } from '@/components/app-shell';
export const dynamic = 'force-dynamic';
export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  if (!configured()) redirect('/login?setup=required');
  const {
    data: { user },
    error,
  } = await (await createClient()).auth.getUser();
  if (error || !user || !user.email_confirmed_at || user.is_anonymous) redirect('/login');
  return (
    <WorkspaceProvider userId={user.id}>
      <AppShell>{children}</AppShell>
    </WorkspaceProvider>
  );
}
