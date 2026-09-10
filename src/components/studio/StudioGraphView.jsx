import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import StudioFlowNode from './StudioFlowNode.jsx';
import { toReactFlowElements } from '../../library/studioGraph.js';

const nodeTypes = { studio: StudioFlowNode };

function nodeVisualKey(node) {
  const d = node?.data || {};
  const p = d.payload || {};
  return [
    node.id,
    d.status,
    d.displayStatus,
    d.statusMessage,
    d.timingLine,
    d.clothingProgress,
    d.running ? '1' : '0',
    node.style?.width ?? '',
    p.imageUrl || '',
    p.meshUrl || '',
    p.garbedImageUrl || '',
    Array.isArray(p.results) ? p.results.length : 0,
  ].join('|');
}

function edgesVisualKey(edges) {
  return (edges || [])
    .map((e) => `${e.id}:${e.className || ''}:${e.animated ? 1 : 0}`)
    .join(';');
}

function StudioGraphViewInner({
  project,
  apiEndpoint,
  running = false,
  onRerunClothing,
}) {
  const onRerunRef = useRef(onRerunClothing);
  onRerunRef.current = onRerunClothing;
  const stableRerun = useCallback((...args) => {
    onRerunRef.current?.(...args);
  }, []);

  const elements = useMemo(
    () =>
      toReactFlowElements(project, {
        apiEndpoint,
        running,
        onRerunClothing: stableRerun,
      }),
    [project, apiEndpoint, running, stableRerun],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(elements.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(elements.edges);
  const { fitView } = useReactFlow();
  const fittedKeyRef = useRef('');

  useEffect(() => {
    setNodes((prev) => {
      const next = elements.nodes.map((en) => {
        const prevNode = prev.find((p) => p.id === en.id);
        return {
          ...en,
          position: prevNode?.position || en.position,
          data: { ...en.data },
        };
      });
      if (
        prev.length === next.length &&
        prev.every((p, i) => nodeVisualKey(p) === nodeVisualKey(next[i]))
      ) {
        return prev;
      }
      return next;
    });

    setEdges((prev) => {
      if (edgesVisualKey(prev) === edgesVisualKey(elements.edges)) {
        return prev;
      }
      return elements.edges;
    });
  }, [elements, setNodes, setEdges]);

  // Fit once per workspace/template — continuous fitView prop caused the flowchart flicker.
  useEffect(() => {
    const key = `${project?.id || ''}|${project?.templateId || ''}|${project?.name || ''}`;
    if (!key || fittedKeyRef.current === key) return;
    fittedKeyRef.current = key;
    const t = window.setTimeout(() => {
      fitView({ padding: 0.18, maxZoom: 1, duration: 0 });
    }, 50);
    return () => window.clearTimeout(t);
  }, [project?.id, project?.templateId, project?.name, fitView]);

  return (
    <div className="studio-graph-host">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={{
          type: 'smoothstep',
        }}
        colorMode="dark"
        nodesDraggable
        nodesConnectable={false}
        elementsSelectable
        proOptions={{ hideAttribution: true }}
        minZoom={0.35}
        maxZoom={1.5}
      >
        <Background gap={18} color="#2a3140" />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable style={{ background: '#12151c' }} />
      </ReactFlow>
    </div>
  );
}

export default function StudioGraphView(props) {
  return (
    <ReactFlowProvider>
      <StudioGraphViewInner {...props} />
    </ReactFlowProvider>
  );
}
