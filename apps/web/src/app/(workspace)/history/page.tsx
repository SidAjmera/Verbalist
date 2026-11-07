'use client';
import { useState } from 'react';
import { Search } from 'lucide-react';
import type { DebateSession } from '@verbalist/shared-types';
import { useApi } from '@/hooks/use-api';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  PrivateNote,
  SessionList,
} from '@/components/page-elements';
export default function History() {
  const [page, setPage] = useState(0),
    [query, setQuery] = useState(''),
    [filter, setFilter] = useState('all');
  const { data, error, loading, reload } = useApi<DebateSession[]>(
    `/v1/debates?limit=30&offset=${page * 30}`,
  );
  const visible = data?.filter(
    (s) =>
      (filter === 'all' || s.status === filter) &&
      s.motion.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <>
      <PageHeader
        eyebrow="THE RECORD OF YOUR REASONING"
        title="Debate history"
        description="Revisit your arguments or pick up where you left off. Everything is saved to your account."
      />
      <div className="mb-5 flex flex-wrap gap-3">
        <label className="relative min-w-52 flex-1">
          <span className="sr-only">Search this page of history</span>
          <Search className="absolute left-3 top-3.5 size-4 text-muted-foreground" />
          <Input
            className="pl-10"
            placeholder="Search motions on this page…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <select
          aria-label="Filter debate status"
          className="field w-auto!"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">All debates</option>
          <option value="active">In progress</option>
          <option value="paused">Paused</option>
          <option value="completed">Completed</option>
        </select>
      </div>
      <Card>
        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} retry={() => void reload()} />
        ) : visible?.length ? (
          <SessionList sessions={visible} />
        ) : (
          <EmptyState
            title={
              data?.length
                ? 'No debates match these filters.'
                : 'Your history starts with your first debate.'
            }
            description={
              data?.length
                ? 'Try a different search, status, or history page.'
                : 'Completed and interrupted sessions appear here automatically.'
            }
          />
        )}
      </Card>
      <div className="mt-5 flex items-center justify-between">
        <Button variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
          Previous
        </Button>
        <span className="text-xs text-muted-foreground">
          Page {page + 1} · Filters apply to this page
        </span>
        <Button
          variant="outline"
          disabled={!data || data.length < 30}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </Button>
      </div>
      <PrivateNote />
    </>
  );
}
