import { AuthForm } from '@/components/auth-form';
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const message =
    error === 'callback'
      ? 'Sign-in could not be completed. Try again or use email and password.'
      : error === 'confirmation'
        ? 'This verification or recovery link is invalid or expired. Request a new link.'
        : '';
  return <AuthForm initialError={message} />;
}
