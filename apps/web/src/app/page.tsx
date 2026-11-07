import { redirect } from 'next/navigation';
import { configured } from '@/lib/supabase/client';
import { createClient } from '@/lib/supabase/server';
export default async function Home() {
  if (!configured()) redirect('/login');
  const {
    data: { user },
  } = await (await createClient()).auth.getUser();
  redirect(user?.email_confirmed_at ? '/dashboard' : '/login');
}
