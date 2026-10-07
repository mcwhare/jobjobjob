import { useEffect, useState } from 'react';
import ReactFlow, { Background, Controls, useReactFlow, ReactFlowProvider, BaseEdge } from 'reactflow';
import 'reactflow/dist/style.css';

// Custom edge that bows outwards when multiple edges share the same start and end points
function MultiEdge({ sourceX, sourceY, targetX, targetY, style, markerEnd, data }) {
  const offsetIndex = data?.offsetIndex || 0;
  const totalEdges = data?.totalEdges || 1;
  
  // Calculate how far to push the curve out from the center line (25px gap between each line)
  const shift = (offsetIndex - (totalEdges - 1) / 2) * 25; 
  
  // Math to find the perpendicular angle to curve the line outward
  const deltaX = targetX - sourceX;
  const deltaY = targetY - sourceY;
  const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
  
  if (distance === 0) return null;

  const normX = -deltaY / distance;
  const normY = deltaX / distance;

  const controlPointX = sourceX + deltaX / 2 + normX * shift;
  const controlPointY = sourceY + deltaY / 2 + normY * shift;

  // Draw a standard SVG Quadratic Bezier curve
  const path = `M ${sourceX} ${sourceY} Q ${controlPointX} ${controlPointY} ${targetX} ${targetY}`;

  return <BaseEdge path={path} style={style} markerEnd={markerEnd} />;
}

// Register our new edge with React Flow
const edgeTypes = { multi: MultiEdge };

function AutoFitView({ nodes }) {
  const { fitView } = useReactFlow();

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      fitView({ duration: 800, padding: 0.15 });
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
  onDeleteFriend,
  isPanEnabled,
  onPanEnabledChange,
}) {
  const [contextMenu, setContextMenu] = useState(null);

  return (
    <div className="w-full h-full bg-slate-950">
      <ReactFlowProvider>
        <ReactFlow 
          nodes={nodes} 
          edges={edges} 
          edgeTypes={edgeTypes} // Hooked up the custom multi-edge renderer
          onNodesChange={onNodesChange} 
          onNodeDragStart={onNodeDragStart}
          onNodeDrag={onNodeDrag}
          onNodeDragStop={onNodeDragStop}
          onNodeContextMenu={(event, node) => {
            event.preventDefault();
            if (node.id.startsWith('friend-')) {
              setContextMenu({ x: event.clientX, y: event.clientY, node });
            }
          }}
          onPaneClick={() => setContextMenu(null)}
          fitView
          minZoom={0.1}
          maxZoom={4}
          panOnDrag={isPanEnabled}
          defaultEdgeOptions={{ type: 'multi', animated: true }} // Set all edges to use the multi curve
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
        {contextMenu && (
          <div
            className="fixed z-[1000] min-w-44 rounded-md border border-slate-700 bg-slate-800 p-1 shadow-xl"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onContextMenu={(event) => event.preventDefault()}
          >
            <button
              type="button"
              className="w-full rounded px-3 py-2 text-left text-sm text-red-300 hover:bg-slate-700"
              onClick={() => {
                onDeleteFriend(contextMenu.node);
                setContextMenu(null);
              }}
            >
              Delete {contextMenu.node.data.label} and entries
            </button>
          </div>
        )}
      </ReactFlowProvider>
    </div>
  );
}