import { useEffect } from 'react';
import ReactFlow, { Background, Controls, useReactFlow, ReactFlowProvider } from 'reactflow';
import 'reactflow/dist/style.css';

function AutoFitView({ nodes }) {
  const { fitView } = useReactFlow();

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      fitView({ duration: 800, padding: 0.1 });
    }, 50);
    
    return () => clearTimeout(timeoutId);
  }, [nodes.length, fitView]); 

  return null; 
}

export default function GraphView({
  nodes,
  edges,
  onNodesChange,
  onNodeDragStart,
  onNodeDrag,
  onNodeDragStop,
  isPanEnabled,
  onPanEnabledChange,
}) {
  return (
    <div className="w-full h-full bg-slate-950">
      <ReactFlowProvider>
        <ReactFlow 
          nodes={nodes} 
          edges={edges} 
          onNodesChange={onNodesChange} 
          onNodeDragStart={onNodeDragStart}
          onNodeDrag={onNodeDrag}
          onNodeDragStop={onNodeDragStop}
          fitView
          panOnDrag={isPanEnabled}
          defaultEdgeOptions={{ type: 'default', animated: true }}
          proOptions={{ hideAttribution: true }}
        >
          <Background color="#334155" gap={20} size={1} />
          <Controls
            showInteractive={false}
            className="!bg-slate-800 !border-slate-700 !fill-white [&>button]:!border-slate-700 hover:[&>button]:!bg-slate-700"
          >
            <button
              type="button"
              className="react-flow__controls-button"
              onClick={() => onPanEnabledChange(!isPanEnabled)}
              title={isPanEnabled ? 'Lock view panning' : 'Unlock view panning'}
              aria-label={isPanEnabled ? 'Lock view panning' : 'Unlock view panning'}
              aria-pressed={!isPanEnabled}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                {isPanEnabled ? (
                  <path d="M18 8h-1V6a5 5 0 0 0-9.9-1h2.1a3 3 0 0 1 5.8 1v2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2Zm0 12H6V10h12Z" />
                ) : (
                  <path d="M18 8h-1V6a5 5 0 0 0-10 0v2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2ZM9 6a3 3 0 0 1 6 0v2H9Zm9 14H6V10h12Z" />
                )}
              </svg>
            </button>
          </Controls>
          <AutoFitView nodes={nodes} />
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  );
}