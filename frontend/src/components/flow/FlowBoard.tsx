import React from 'react';
import ReactFlow, { Background, BackgroundVariant, ReactFlowProvider } from 'reactflow';
import 'reactflow/dist/style.css';
import classes from './FlowBoard.module.scss'

const FlowBoard: React.FC = () => {
  return (
    <div className={classes.space_container}>
      <ReactFlowProvider>
        <ReactFlow nodes={[]} edges={[]} fitView>
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  );
};

export default FlowBoard;
