import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
export async function GET(request: NextRequest) {
  const hash = request.nextUrl.searchParams.get('token_hash'),
    type = request.nextUrl.searchParams.get('type');
  const origin = process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin;
  if (hash && (type === 'signup' || type === 'recovery' || type === 'email')) {
    const { error } = await (await createClient()).auth.verifyOtp({ token_hash: hash, type });
    if (!error)
      return NextResponse.redirect(
        new URL(type === 'recovery' ? '/reset-password' : '/dashboard', origin),
      );
  }
  return NextResponse.redirect(new URL('/login?error=confirmation', origin));
}
