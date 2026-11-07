'use client';
import { useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  type Node,
  type Edge,
  MarkerType,
} from '@xyflow/react';
import { useTheme } from 'next-themes';
import type { AnalysisDetail } from '@verbalist/shared-types';
import '@xyflow/react/dist/style.css';
export default function ArgumentGraph({ analysis }: { analysis: AnalysisDetail }) {
  const { resolvedTheme } = useTheme();
  const [selected, setSelected] = useState<string | null>(null);
  const rows = { human: 0, ai: 0 };
  const [nodes, , onNodesChange] = useNodesState<Node>(
    analysis.arguments.map((item) => ({
      id: item.id,
      position: { x: item.data.speaker === 'human' ? 0 : 430, y: rows[item.data.speaker]++ * 190 },
      data: {
        label: (
          <div className="text-left">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-primary">
              {item.data.speaker === 'human' ? 'You' : 'Opponent'} ·{' '}
              {item.data.kind.replaceAll('_', ' ')}
            </p>
            <p className="text-xs leading-5">{item.data.text.slice(0, 150)}</p>
          </div>
        ),
      },
      style: {
        width: 290,
        padding: 16,
        border: '1px solid var(--border)',
        background: 'var(--card)',
        color: 'var(--foreground)',
        borderRadius: 12,
      },
      ariaLabel: `${item.data.kind.replaceAll('_', ' ')}: ${item.data.text}`,
    })),
  );
  const edges: Edge[] = analysis.links.map((link) => ({
    id: link.id,
    source: link.source_id,
    target: link.target_id,
    label: link.relation,
    markerEnd: { type: MarkerType.ArrowClosed },
    style: { stroke: '#438bff' },
    labelStyle: { fill: 'var(--foreground)' },
    labelBgStyle: { fill: 'var(--card)' },
  }));
  const item = analysis.arguments.find((item) => item.id === selected);
  return (
    <>
      <div
        className="h-[430px] w-full overflow-hidden rounded-xl border border-border"
        role="region"
        aria-label="Interactive argument map"
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onNodeClick={(_, node) => setSelected(node.id)}
          nodesConnectable={false}
          edgesReconnectable={false}
          deleteKeyCode={null}
          fitView
          minZoom={0.2}
          colorMode={resolvedTheme === 'light' ? 'light' : 'dark'}
        >
          <Background />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
      {item && (
        <div className="notice mt-3" aria-live="polite">
          <p className="font-medium">
            {item.data.kind === 'potential_fallacy'
              ? 'Potential reasoning flaw'
              : item.data.kind.replaceAll('_', ' ')}
          </p>
          <p className="mt-2">{item.data.explanation}</p>
          <p className="mt-2">
            Turn {item.data.ref.position + 1} · Confidence {Math.round(item.data.confidence * 100)}%
          </p>
        </div>
      )}
      <p className="mt-3 text-xs leading-6 text-muted-foreground">
        Pan, zoom or move nodes to explore. Select a node for its explanation. The argument list
        below offers the same findings and exact transcript excerpts.
      </p>
    </>
  );
}
