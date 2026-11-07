import Link from 'next/link';
export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg p-10">
      <p className="eyebrow">404</p>
      <h1 className="page-title mt-3">This page is out of bounds.</h1>
      <p className="subtitle mb-6">Return to your workspace to pick up your next argument.</p>
      <Link href="/dashboard" className="text-primary">
        Back to overview →
      </Link>
    </div>
  );
}
