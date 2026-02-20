import React from 'react';
import ReactFlow, { ReactFlowProvider } from 'reactflow';
import 'reactflow/dist/style.css';
import classes from './FlowBoard.module.scss'

const FlowBoard: React.FC = () => {
  return (
    <div className={classes.space_container}>
      <ReactFlowProvider>
        <ReactFlow nodes={[]} edges={[]} fitView />
      </ReactFlowProvider>
    </div>
  );
};

export default FlowBoard;
