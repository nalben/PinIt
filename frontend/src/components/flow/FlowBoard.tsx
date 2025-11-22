import React, { useState, useEffect, useCallback } from 'react';
import FlowBoardContainer from './FlowBoardContainer';
import { Node, Edge, addEdge } from 'reactflow';

interface Card {
  id: number;
  board_id: number;
  type: 'circle' | 'rectangle';
  title: string;
  text: string | null;
  image_path: string | null;
  x: number;
  y: number;
  linked_card_ids: string | null;
}

const FlowBoard: React.FC = () => {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);

  useEffect(() => {
    // Получаем данные из API
    fetch('http://localhost:3001/cards')
      .then(res => res.json())
      .then((data: Card[]) => {
        const mappedNodes: Node[] = data.map(card => ({
          id: String(card.id),
          type: 'default',
          position: { x: card.x, y: card.y },
          data: { label: card.type === 'circle' ? <div style={{
            borderRadius: '50%',
            width: 80,
            height: 80,
            background: '#eee',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center'
          }}>{card.title}</div> : card.text },
        }));

        const mappedEdges: Edge[] = [];
        data.forEach(card => {
          if (card.linked_card_ids) {
            card.linked_card_ids.split(',').map(id => id.trim()).forEach(targetId => {
              mappedEdges.push({
                id: `e${card.id}-${targetId}`,
                source: String(card.id),
                target: String(targetId),
                animated: true,
              });
            });
          }
        });

        setNodes(mappedNodes);
        setEdges(mappedEdges);
      });
  }, []);

  const onNodesChange = useCallback(
    (changes: any) => setNodes(nds => nds.map(node => ({ ...node, ...changes.find((c: any) => c.id === node.id) }))),
    []
  );

  const onEdgesChange = useCallback(
    (changes: any) => setEdges(eds => eds.map(edge => ({ ...edge, ...changes.find((c: any) => c.id === edge.id) }))),
    []
  );

  const onConnect = useCallback(
    (connection: any) => setEdges(eds => addEdge(connection, eds)),
    []
  );

  return (
    <FlowBoardContainer
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
    />
  );
};

export default FlowBoard;
