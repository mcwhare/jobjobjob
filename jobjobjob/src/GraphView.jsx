import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactFlow, { applyNodeChanges, Background, Controls, Handle, Position, useReactFlow, ReactFlowProvider, BaseEdge } from 'reactflow';
import 'reactflow/dist/style.css';

import { forceSimulation, forceY, forceX, forceManyBody, forceCollide, forceLink } from 'd3-force';
import { GRAPH_SETTINGS } from '../graphSettings';
import { EDGE_HANDLE_POSITIONS } from './edgeHandlePositions';
import { buildRoomGraph, getNodeSize, updateEdgeHandles, updateNodeFontSize } from './graphBuilder';

// Custom edge that bows outwards when multiple edges share the same start and end points
function MultiEdge({ sourceX, sourceY, targetX, targetY, style, markerEnd, data }) {
  const offsetIndex = data?.offsetIndex || 0;
  const totalEdges = data?.totalEdges || 1;
  
  // Uses the new customizable edge separation setting
  const edgeSeparation = data?.edgeSeparation
    ?? GRAPH_SETTINGS.edges.multiEdgeSeparation;
  const shift = (offsetIndex - (totalEdges - 1) / 2) * edgeSeparation;
  
  const deltaX = targetX - sourceX;
  const deltaY = targetY - sourceY;
  const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
  
  if (distance === 0) return null;

  const normX = -deltaY / distance;
  const normY = deltaX / distance;

  const controlPointX = sourceX + deltaX / 2 + normX * shift;
  const controlPointY = sourceY + deltaY / 2 + normY * shift;

  const path = `M ${sourceX} ${sourceY} Q ${controlPointX} ${controlPointY} ${targetX} ${targetY}`;

  return <BaseEdge path={path} style={style} markerEnd={markerEnd} />;
}

const edgeTypes = { multi: MultiEdge };
const SIMULATION_RENDER_INTERVAL_MS = 1000 / 30;

function DynamicCircleNode({ data, isConnectable }) {
  const getHandleStyle = (point) => ({
    left: `${point.x * 100}%`,
    top: `${point.y * 100}%`,
    opacity: 0,
    transform: 'translate(-50%, -50%)'
  });

  return (
    <>
      {EDGE_HANDLE_POSITIONS.flatMap(({ id, left, right }) => [
        <Handle
          key={`left-${id}`}
          id={`target-left-${id}`}
          type="target"
          position={Position.Left}
          isConnectable={isConnectable}
          style={getHandleStyle(left)}
        />,
        <Handle
          key={`right-${id}`}
          id={`source-right-${id}`}
          type="source"
          position={Position.Right}
          isConnectable={isConnectable}
          style={getHandleStyle(right)}
        />,
        <Handle
          key={`left-source-${id}`}
          id={`source-left-${id}`}
          type="source"
          position={Position.Left}
          isConnectable={isConnectable}
          style={getHandleStyle(left)}
        />,
        <Handle
          key={`right-target-${id}`}
          id={`target-right-${id}`}
          type="target"
          position={Position.Right}
          isConnectable={isConnectable}
          style={getHandleStyle(right)}
        />
      ])}
      <div
        className="nodrag nopan"
        style={{
          display: 'flex',
          width: '100%',
          height: '100%',
          alignItems: 'center',
          justifyContent: 'center',
          boxSizing: 'border-box'
        }}
      >
        <span
          style={{
            display: 'block',
            width: '100%',
            padding: '0 12px',
            boxSizing: 'border-box',
            whiteSpace: 'pre-line',
            textAlign: 'center',
            lineHeight: 1.2,
            wordBreak: 'normal'
          }}
        >
          {data.displayLabel || data.label}
        </span>
      </div>
    </>
  );
}

const nodeTypes = { dynamicCircle: DynamicCircleNode };

const EDGE_LEGEND_ITEMS = [
  { color: '#ef4444', label: 'Rejected' },
  { color: '#374151', label: 'Ghosted' },
  { color: '#3b82f6', label: 'Accepted' },
  { color: '#22c55e', label: 'Offered' },
  { color: '#cbd5e1', label: 'Other' }
];

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

function GraphView({
  applicationsData,
  onDeleteFriend,
  isPanEnabled,
  onPanEnabledChange,
  graphSettings,
  animatedEdges,
}) {
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const renderedNodes = useMemo(
    () => updateNodeFontSize(nodes, graphSettings.nodes.fontSize),
    [nodes, graphSettings.nodes.fontSize]
  );
  const renderedEdges = useMemo(() => updateEdgeHandles(edges, renderedNodes).map(edge => ({
    ...edge,
    animated: animatedEdges,
    data: {
      ...edge.data,
      edgeSeparation: graphSettings.edges.multiEdgeSeparation
    }
  }  )), [edges, renderedNodes, animatedEdges, graphSettings.edges.multiEdgeSeparation]);
  const [contextMenu, setContextMenu] = useState(null);
  const graphSettingsRef = useRef(graphSettings);
  const simulationRef = useRef(null);
  const d3NodesRef = useRef([]);
  const nodePositionsRef = useRef(new Map());
  const initialAlphaDecayRef = useRef(null);
  const settledTicksRef = useRef(0);
  const visibleLegendItems = useMemo(() => {
    const displayedEdgeColors = new Set(edges.map((edge) => edge.style?.stroke?.toLowerCase()));
    return EDGE_LEGEND_ITEMS.filter(({ color }) => displayedEdgeColors.has(color));
  }, [edges]);

  const onNodesChange = useCallback(
    (changes) => setNodes((currentNodes) => applyNodeChanges(changes, currentNodes)),
    []
  );

  const onNodeDragStart = useCallback((event, node) => {
    if (!simulationRef.current || (!node.id.startsWith('stage-') && !node.id.startsWith('company-'))) return;
    if (initialAlphaDecayRef.current !== null) {
      simulationRef.current.alphaDecay(initialAlphaDecayRef.current);
    }
    settledTicksRef.current = 0;
    simulationRef.current.alphaTarget(0.3).restart();
    const d3Node = d3NodesRef.current.find((simulationNode) => simulationNode.id === node.id);
    if (d3Node) {
      d3Node.fx = node.position.x;
      d3Node.fy = node.position.y;
    }
  }, []);

  const onNodeDrag = useCallback((event, node) => {
    nodePositionsRef.current.set(node.id, node.position);
    if (!simulationRef.current || (!node.id.startsWith('stage-') && !node.id.startsWith('company-'))) return;
    const d3Node = d3NodesRef.current.find((simulationNode) => simulationNode.id === node.id);
    if (d3Node) {
      d3Node.fx = node.position.x;
      d3Node.fy = node.position.y;
    }
  }, []);

  const onNodeDragStop = useCallback((event, node) => {
    nodePositionsRef.current.set(node.id, node.position);
    if (!simulationRef.current || (!node.id.startsWith('stage-') && !node.id.startsWith('company-'))) return;
    simulationRef.current.alphaTarget(0);
    const d3Node = d3NodesRef.current.find((simulationNode) => simulationNode.id === node.id);
    if (d3Node) {
      d3Node.fx = null;
      d3Node.fy = null;
    }
  }, []);

  const handleDeleteFriend = useCallback(async (node) => {
    const deleted = await onDeleteFriend(node);
    if (deleted) nodePositionsRef.current.delete(node.id);
  }, [onDeleteFriend]);

  useEffect(() => {
    graphSettingsRef.current = graphSettings;
  }, [graphSettings]);

  useEffect(() => {
    const collisionForce = simulationRef.current?.force('collide');
    if (collisionForce) {
      collisionForce.radius(node => (
        getNodeSize(node.data?.label, graphSettings.nodes.fontSize) / 2
        + graphSettings.physics.collisionRadiusOffset
      ));
    }
  }, [
    graphSettings.nodes.fontSize,
    graphSettings.physics.collisionRadiusOffset
  ]);

  useEffect(() => {
    if (applicationsData.length === 0) {
      d3NodesRef.current = [];
      setNodes([]);
      setEdges([]);
      return undefined;
    }

    const { friendNodes, simulationNodes, edges: graphEdges, attractionLinks } = buildRoomGraph(
      applicationsData,
      d3NodesRef.current,
      nodePositionsRef.current,
      graphSettingsRef.current
    );
    d3NodesRef.current = simulationNodes;
    setEdges(graphEdges);

    const simulation = forceSimulation(simulationNodes)
      .force('collide', forceCollide(d => (d.radius || 55) + graphSettings.physics.collisionRadiusOffset).strength(graphSettings.physics.collisionStrength))
      .force('x', forceX(d => d.targetX).strength(d => d.isCompany ? graphSettings.physics.xGravityCompany : graphSettings.physics.xGravityStage))
      .force('y', forceY(d => d.targetY).strength(d => d.isCompany ? graphSettings.physics.yGravityCompany : graphSettings.physics.yGravityStage))
      .force('charge', forceManyBody().strength(d => (
        d.isCompany
          ? graphSettings.physics.repulsionStrengthCompany
          : graphSettings.physics.repulsionStrengthStage
      )))
      .force('stage-company-attraction', forceLink(attractionLinks)
        .id(node => node.id)
        .distance(link => Math.hypot(
          link.source.targetX - link.target.targetX,
          link.source.targetY - link.target.targetY
        ))
        .strength(graphSettings.physics.stageCompanyAttractionStrength));

    simulationRef.current = simulation;
    initialAlphaDecayRef.current = simulation.alphaDecay();
    settledTicksRef.current = 0;
    let lastRenderTime = -Infinity;
    const renderSimulationState = () => {
      const positionedSimNodes = simulationNodes.map((node) => {
        return {
          id: node.id,
          position: { x: node.x, y: node.y },
          data: node.data,
          className: node.className,
          style: node.style,
          sourcePosition: node.sourcePosition,
          targetPosition: node.targetPosition,
          type: node.type
        };
      });

      const positionedFriendNodes = friendNodes.map((node) => ({
        ...node,
        position: nodePositionsRef.current.get(node.id) || node.position
      }));

      const currentNodes = [...positionedFriendNodes, ...positionedSimNodes];
      setNodes(currentNodes);
      setEdges((currentEdges) => updateEdgeHandles(currentEdges, currentNodes));
    };

    simulation.on('tick', () => {
      const maxVelocity = simulationNodes.reduce(
        (maximum, node) => Math.max(maximum, Math.hypot(node.vx, node.vy)),
        0
      );
      if (
        simulation.alpha() <= graphSettings.physics.settledAlphaThreshold
        && maxVelocity <= graphSettings.physics.settledVelocityThreshold
      ) {
        settledTicksRef.current += 1;
        if (
          settledTicksRef.current >= graphSettings.physics.settledTicksBeforeFastCooling
          && simulation.alphaDecay() < graphSettings.physics.settledAlphaDecay
        ) {
          simulation.alphaDecay(graphSettings.physics.settledAlphaDecay);
        }
      } else {
        settledTicksRef.current = 0;
      }

      const now = performance.now();
      if (now - lastRenderTime < SIMULATION_RENDER_INTERVAL_MS) return;
      lastRenderTime = now;
      renderSimulationState();
    });
    simulation.on('end', renderSimulationState);

    return () => {
      simulation.stop();
      if (simulationRef.current === simulation) simulationRef.current = null;
      initialAlphaDecayRef.current = null;
      settledTicksRef.current = 0;
    };
  }, [applicationsData, graphSettings.layout, graphSettings.physics]);

  return (
    <div className="w-full h-full bg-slate-950">
      <ReactFlowProvider>
        <ReactFlow 
          nodes={renderedNodes} 
          edges={renderedEdges} 
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          defaultEdgeOptions={{ type: 'multi', animated: animatedEdges }}
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
        {visibleLegendItems.length > 0 && (
          <div
            aria-label="Edge color legend"
            className="absolute bottom-3 right-3 z-10 rounded-lg border border-slate-700 bg-slate-900/95 p-3 text-xs text-slate-200 shadow-xl sm:bottom-4 sm:right-4"
          >
            <h3 className="mb-2 text-xs font-semibold text-white">Edge colors</h3>
            <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-1">
              {visibleLegendItems.map(({ color, label }) => (
                <li key={color} className="flex items-center gap-2">
                  <span className="h-0.5 w-6 shrink-0" style={{ backgroundColor: color }} />
                  <span>{label}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
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
                handleDeleteFriend(contextMenu.node);
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

export default memo(GraphView);