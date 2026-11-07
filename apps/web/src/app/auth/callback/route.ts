import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const destination =
    request.nextUrl.searchParams.get('next') === '/reset-password'
      ? '/reset-password'
      : '/dashboard';
  if (code) {
    const { error } = await (await createClient()).auth.exchangeCodeForSession(code);
    if (!error)
      return NextResponse.redirect(
        new URL(destination, process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin),
      );
  }
  return NextResponse.redirect(
    new URL('/login?error=callback', process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin),
  );
}
