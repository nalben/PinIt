import React, { FC } from 'react';
import ReactFlow, { ReactFlowProvider } from 'reactflow';
import 'reactflow/dist/style.css';
import { MiniMap, Controls, Background } from 'reactflow';

interface FlowBoardContainerProps {
  nodes: any[];
  edges: any[];
  onNodesChange: any;
  onEdgesChange: any;
  onConnect: any;
  onInit?: (instance: any) => void;
}

const FlowBoardContainer: FC<FlowBoardContainerProps> = ({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onInit,
}) => (
  <div style={{ width: '100%', height: '100vh' }}>
    <ReactFlowProvider>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onInit={onInit}
        fitView
      >
        <MiniMap />
        <Controls />
        <Background color="#aaa" gap={16} />
      </ReactFlow>
    </ReactFlowProvider>
  </div>
);

export default FlowBoardContainer;
