import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import Papa from 'papaparse';
import { MarkerType, Position, applyNodeChanges } from 'reactflow';
import GraphView from './GraphView';

import { db } from '../firebaseConfig';
import { collection, doc, onSnapshot, writeBatch } from 'firebase/firestore';
import { forceSimulation, forceY, forceX, forceManyBody, forceCollide } from 'd3-force';

// Define the chronological order to calculate left-to-right gravity
const STAGE_ORDER = ['Applied', 'OA', 'Interview 1', 'Interview 2', 'Offer', 'Rejected', 'Ghosted'];

const circleNodeClass = "bg-slate-900 text-white border-2 border-slate-600 rounded-full flex justify-center items-center text-xs font-bold shadow-lg";

const getNodeSize = (label) => {
  const safeLabel = (label || '').replace(/\s+/g, '');
  const estimatedWidth = Math.max(82, Math.min(180, 72 + safeLabel.length * 6));
  return estimatedWidth;
};

const STAGE_COLORS = {
  'Applied': '#94a3b8',
  'OA': '#60a5fa',
  'Interview 1': '#a855f7',
  'Interview 2': '#a855f7',
  'Offer': '#22c55e',
  'Rejected': '#ef4444',
  'Ghosted': '#78716c'
};

const getStageClass = (stage) => {
  const classes = {
    'Applied': "bg-slate-800 text-slate-300 border-2 border-slate-600",
    'OA': "bg-blue-900 text-blue-200 border-2 border-blue-700",
    'Interview 1': "bg-purple-900 text-purple-200 border-2 border-purple-700",
    'Interview 2': "bg-purple-900 text-purple-200 border-2 border-purple-700",
    'Offer': "bg-green-900 text-green-200 border-2 border-green-700",
    'Rejected': "bg-red-900 text-red-200 border-2 border-red-700",
    'Ghosted': "bg-stone-800 text-stone-400 border-2 border-stone-600 border-dashed"
  };
  const baseClass = " rounded-full flex justify-center items-center text-[10px] font-bold shadow-lg text-center p-2";
  return (classes[stage] || "bg-slate-800 text-slate-300 border-2 border-slate-600") + baseClass;
};

const formatStageName = (stageInput) => {
  const map = {
    'applied': 'Applied',
    'oa': 'OA',
    'interview 1': 'Interview 1',
    'interview 2': 'Interview 2',
    'interview': 'Interview 1',
    'offer': 'Offer',
    'offered': 'Offer',
    'rejected': 'Rejected',
    'ghosted': 'Ghosted'
  };
  return map[stageInput.toLowerCase()] || stageInput;
};

export default function Room() {
  const { roomId } = useParams();
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [uploaderName, setUploaderName] = useState('');
  const [isPanEnabled, setIsPanEnabled] = useState(true);

  const simulationRef = useRef(null);
  const d3NodesRef = useRef([]);

  const onNodesChange = useCallback(
    (changes) => setNodes((nds) => applyNodeChanges(changes, nds)),
    []
  );

  const onNodeDragStart = useCallback((event, node) => {
    if (!simulationRef.current || !node.id.startsWith('stage-')) return;
    simulationRef.current.alphaTarget(0.3).restart();
    const d3Node = d3NodesRef.current.find(n => n.id === node.id);
    if (d3Node) {
      d3Node.fx = node.position.x;
      d3Node.fy = node.position.y;
    }
  }, []);

  const onNodeDrag = useCallback((event, node) => {
    if (!simulationRef.current || !node.id.startsWith('stage-')) return;
    const d3Node = d3NodesRef.current.find(n => n.id === node.id);
    if (d3Node) {
      d3Node.fx = node.position.x;
      d3Node.fy = node.position.y;
    }
  }, []);

  const onNodeDragStop = useCallback((event, node) => {
    if (!simulationRef.current || !node.id.startsWith('stage-')) return;
    simulationRef.current.alphaTarget(0);
    const d3Node = d3NodesRef.current.find(n => n.id === node.id);
    if (d3Node) {
      d3Node.fx = null;
      d3Node.fy = null;
    }
  }, []);

  useEffect(() => {
    const friendsRef = collection(db, 'rooms', roomId, 'friends');
    
    const unsubscribe = onSnapshot(friendsRef, (snapshot) => {
      const allData = [];
      snapshot.forEach(doc => {
        allData.push(...doc.data().applications);
      });

      if (allData.length === 0) {
        setNodes([]);
        setEdges([]);
        return;
      }

      const uniqueFriends = [...new Set(allData.map(row => row.Friend))].filter(Boolean);
      const uniqueCompanies = [...new Set(allData.map(row => row.Company))].filter(Boolean);
      
      const allStagesRaw = allData.flatMap(row => {
        if (!row.Stages) return [];
        return row.Stages.split(',').map(s => formatStageName(s.trim()));
      });
      const uniqueStages = [...new Set(allStagesRaw)].filter(Boolean);

      // Dynamically calculate graph width based on the number of active middle stages
      const centerX = 600; 
      const dynamicSpread = 350 + (uniqueStages.length * 40); // Widens as more stages appear
      const columnFriendsX = centerX - dynamicSpread;
      const columnCompaniesX = centerX + dynamicSpread;

      const friendNodes = uniqueFriends.map((name, index) => {
        const size = getNodeSize(name);
        return {
          id: `friend-${name}`,
          type: 'default',
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
          position: { x: columnFriendsX, y: 100 + (index * 120) },
          data: { label: name },
          className: circleNodeClass,
          style: { borderRadius: '50%', width: size, height: size }
        };
      });

      const companyNodes = uniqueCompanies.map((name, index) => {
        const size = getNodeSize(name);
        return {
          id: `company-${name}`,
          type: 'default',
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
          position: { x: columnCompaniesX, y: 100 + (index * 120) },
          data: { label: name },
          className: circleNodeClass,
          style: { borderRadius: '50%', width: size, height: size }
        };
      });

      const maxNodesCount = Math.max(friendNodes.length, companyNodes.length);
      const centerY = (100 + (maxNodesCount * 120)) / 2;

      const stageNodes = uniqueStages.map((stage) => {
        const existingNode = d3NodesRef.current.find(n => n.id === `stage-${stage}`);
        const size = getNodeSize(stage);
        
        // Calculate a horizontal gravity target based on the stage's chronological order
        const stageIndex = STAGE_ORDER.indexOf(stage);
        const horizontalOffset = stageIndex !== -1 
          ? (stageIndex - (STAGE_ORDER.length / 2)) * 80 
          : 0;
        const targetX = centerX + horizontalOffset;

        return {
          id: `stage-${stage}`,
          type: 'default',
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
          data: { label: stage },
          className: getStageClass(stage),
          style: { borderRadius: '50%', width: size, height: size },
          targetX: targetX, // Store targetX for the physics engine
          x: existingNode ? existingNode.x : targetX + (Math.random() - 0.5) * 50,
          y: existingNode ? existingNode.y : centerY + (Math.random() - 0.5) * 50,
          fx: existingNode ? existingNode.fx : null,
          fy: existingNode ? existingNode.fy : null
        };
      });
      
      d3NodesRef.current = stageNodes;

      const newEdges = [];
      allData.forEach((row, index) => {
        if (!row.Friend || !row.Company || !row.Stages) return;
        
        const completedStages = row.Stages.split(',').map(s => formatStageName(s.trim()));
        if (completedStages.length === 0) return;

        const finalStage = completedStages[completedStages.length - 1];
        const edgeColor = STAGE_COLORS[finalStage] || '#94a3b8'; 

        newEdges.push({
          id: `e-${row.Friend}-${completedStages[0]}-${index}-start`,
          source: `friend-${row.Friend}`,
          target: `stage-${completedStages[0]}`,
          style: { stroke: edgeColor, strokeWidth: 2 }
        });

        for (let i = 0; i < completedStages.length - 1; i++) {
          newEdges.push({
            id: `e-${completedStages[i]}-${completedStages[i+1]}-${index}-mid`,
            source: `stage-${completedStages[i]}`,
            target: `stage-${completedStages[i+1]}`,
            style: { stroke: edgeColor, strokeWidth: 2 },
            animated: true 
          });
        }

        newEdges.push({
          id: `e-${finalStage}-${row.Company}-${index}-end`,
          source: `stage-${finalStage}`,
          target: `company-${row.Company}`,
          markerEnd: { type: MarkerType.ArrowClosed, color: edgeColor },
          style: { stroke: edgeColor, strokeWidth: 2 }
        });
      });

      setEdges(newEdges);

      if (simulationRef.current) simulationRef.current.stop();

      simulationRef.current = forceSimulation(d3NodesRef.current)
        .force('collide', forceCollide(110).strength(1.2)) 
        // Pull each node toward its specific chronological X target
        .force('x', forceX(d => d.targetX).strength(0.06)) 
        .force('y', forceY(centerY).strength(0.04))       
        .force('charge', forceManyBody().strength(-500)); 

      simulationRef.current.on('tick', () => {
        const positionedStageNodes = d3NodesRef.current.map((node) => ({
          id: node.id,
          position: { x: node.x, y: node.y },
          data: node.data,
          className: node.className,
          style: node.style,
          sourcePosition: node.sourcePosition,
          targetPosition: node.targetPosition,
          type: node.type
        }));
        
        setNodes([...friendNodes, ...positionedStageNodes, ...companyNodes]);
      });

    });

    return () => unsubscribe();
  }, [roomId]);

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    if (!uploaderName.trim()) {
      alert("Please enter your name in the text box before uploading.");
      event.target.value = null; 
      return;
    }

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const data = results.data;
        
        const formattedApplications = data.map(row => {
          const stagesRaw = row.Stages || row.Results; 
          return {
            Friend: uploaderName.trim(),
            Company: row.Company?.trim(),
            Stages: stagesRaw?.trim()
          };
        }).filter(row => row.Company && row.Stages);

        if (formattedApplications.length === 0) {
          alert("Could not find any valid rows. Please ensure your CSV has 'Company' and 'Stages' (or 'Results') columns.");
          event.target.value = null;
          return;
        }

        const batch = writeBatch(db);
        const friendRef = doc(db, 'rooms', roomId, 'friends', uploaderName.trim());
        batch.set(friendRef, { applications: formattedApplications });
        
        await batch.commit();
        event.target.value = null;
        setUploaderName('');
      }
    });
  };

  return (
    <div className="flex flex-col h-screen bg-slate-950 font-sans">
      <div className="p-4 bg-slate-900 border-b border-slate-800 flex flex-col sm:flex-row justify-between items-center gap-4 z-10 shadow-md">
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <div>
            <span className="text-slate-400 mr-2 text-sm">Room ID:</span>
            <strong className="tracking-widest text-white">{roomId}</strong>
          </div>
          <div className="text-slate-600 hidden sm:block">|</div>
          <div className="text-sm text-slate-400">Share this URL with friends to collaborate</div>
        </div>

        <div className="flex items-center gap-3">
          <input 
            type="text" 
            placeholder="Enter your name..."
            value={uploaderName}
            onChange={(e) => setUploaderName(e.target.value)}
            className="px-3 py-2 bg-slate-800 text-white border border-slate-700 rounded-md text-sm focus:outline-none focus:border-emerald-500 w-40"
          />
          <label className="cursor-pointer px-4 py-2 text-sm font-bold rounded-md bg-emerald-600 text-white hover:bg-emerald-500 transition-colors shadow-md flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Upload CSV
            <input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
          </label>
        </div>
      </div>

      <div className="flex-1 w-full relative">
        <GraphView 
          nodes={nodes} 
          edges={edges} 
          onNodesChange={onNodesChange} 
          onNodeDragStart={onNodeDragStart}
          onNodeDrag={onNodeDrag}
          onNodeDragStop={onNodeDragStop}
          isPanEnabled={isPanEnabled}
          onPanEnabledChange={setIsPanEnabled}
        />
      </div>
    </div>
  );
}