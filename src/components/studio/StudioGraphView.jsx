import React, { useEffect, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import StudioFlowNode from './StudioFlowNode.jsx';
import { toReactFlowElements } from '../../library/studioGraph.js';

const nodeTypes = { studio: StudioFlowNode };

export default function StudioGraphView({
  project,
  apiEndpoint,
  running = false,
  onRerunClothing,
}) {
  const elements = useMemo(
    () =>
      toReactFlowElements(project, {
        apiEndpoint,
        running,
        onRerunClothing,
      }),
    [project, apiEndpoint, running, onRerunClothing],
  );
  const [nodes, setNodes, onNodesChange] = useNodesState(elements.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(elements.edges);

  useEffect(() => {
    setNodes((prev) =>
      elements.nodes.map((en) => {
        const prevNode = prev.find((p) => p.id === en.id);
        return {
          ...en,
          position: prevNode?.position || en.position,
          // Force React Flow / memo to see status + payload changes
          data: { ...en.data },
        };
      }),
    );
    // Replace edges fully so animated / dash styles always re-apply.
    setEdges(elements.edges.map((e) => ({ ...e })));
  }, [elements, setNodes, setEdges]);

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
        fitView
        fitViewOptions={{ padding: 0.18, maxZoom: 1 }}
        colorMode="dark"
        nodesDraggable
        nodesConnectable={false}
        elementsSelectable
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={18} color="#2a3140" />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable style={{ background: '#12151c' }} />
      </ReactFlow>
    </div>
  );
}
