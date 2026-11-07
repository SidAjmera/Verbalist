'use client';
import { Button } from '@/components/ui/button';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="mx-auto max-w-lg p-10">
      <h1 className="page-title">Something interrupted your workspace.</h1>
      <p className="subtitle mb-6">
        Your saved debates are still in your account. Retry the page to reconnect.
      </p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
