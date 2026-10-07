import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Papa from 'papaparse';
import { MarkerType, Position, applyNodeChanges } from 'reactflow';
import GraphView from './GraphView';

import { db } from '../firebaseConfig';
import { collection, deleteDoc, doc, onSnapshot, writeBatch } from 'firebase/firestore';
import { forceSimulation, forceY, forceX, forceManyBody, forceCollide } from 'd3-force';

// Define the chronological order to calculate left-to-right gravity
const STAGE_ORDER = ['Applied', 'OA', 'Interview 1', 'Interview 2', 'Offer', 'Rejected', 'Ghosted'];
const ENDPOINT_GRID_SPACING = 220;
const OUTCOME_COLORS = {
  rejected: '#ef4444',
  ghosted: '#374151',
  accepted: '#3b82f6',
  offered: '#22c55e',
  default: '#cbd5e1'
};

const circleNodeClass = "bg-slate-900 text-white border-2 border-slate-600 rounded-full flex justify-center items-center text-xs font-bold shadow-lg";

const getNodeSize = (label) => {
  const safeLabel = (label || '').replace(/\s+/g, '');
  const estimatedWidth = Math.max(82, Math.min(180, 72 + safeLabel.length * 6));
  return estimatedWidth;
};

const getStageCategory = (stage) => {
  const normalizedStage = stage.toLowerCase().replace(/[^a-z]/g, '');
  if (normalizedStage.startsWith('reject')) return 'rejected';
  if (normalizedStage.startsWith('ghost')) return 'ghosted';
  if (normalizedStage.startsWith('accept')) return 'accepted';
  if (normalizedStage.startsWith('offer')) return 'offered';
  if (normalizedStage.startsWith('apply')) return 'applied';
  if (normalizedStage.startsWith('oa')) return 'assessment';
  if (normalizedStage.startsWith('interview')) return 'interview';
  return 'other';
};

const getStageProgress = (stage) => {
  const category = getStageCategory(stage);
  if (category === 'applied') return 0;
  if (category === 'assessment') return 1;
  if (category === 'interview') {
    const interviewNumber = Number(stage.match(/\d+/)?.[0]);
    return interviewNumber ? 1 + interviewNumber : 2;
  }
  if (category === 'offered') return 4;
  if (category === 'accepted') return 5;
  if (category === 'rejected') return 6;
  if (category === 'ghosted') return 7;
  const knownStageIndex = STAGE_ORDER.indexOf(stage);
  return knownStageIndex === -1 ? 3 : knownStageIndex;
};

const getFurthestStage = (stages) => stages.reduce((furthest, stage) => (
  !furthest || getStageProgress(stage) > getStageProgress(furthest) ? stage : furthest
), '');

const getOutcomeColor = (stage) => OUTCOME_COLORS[getStageCategory(stage)] || OUTCOME_COLORS.default;

const getStageClass = (stage) => {
  const classesByCategory = {
    rejected: "bg-red-900 text-red-200 border-2 border-red-700",
    ghosted: "bg-stone-800 text-stone-300 border-2 border-stone-600 border-dashed",
    accepted: "bg-blue-900 text-blue-200 border-2 border-blue-700",
    offered: "bg-green-900 text-green-200 border-2 border-green-700",
    applied: "bg-slate-800 text-slate-300 border-2 border-slate-600",
    assessment: "bg-slate-800 text-slate-300 border-2 border-slate-600",
    interview: "bg-slate-800 text-slate-300 border-2 border-slate-600",
    other: "bg-slate-800 text-slate-300 border-2 border-slate-600"
  };
  const baseClass = " rounded-full flex justify-center items-center text-[10px] font-bold shadow-lg text-center p-2";
  return classesByCategory[getStageCategory(stage)] + baseClass;
};

const formatStageName = (stageInput) => {
  const trimmedStage = stageInput.trim();
  const category = getStageCategory(trimmedStage);
  const canonicalNames = {
    applied: 'Applied',
    offered: 'Offer',
    accepted: 'Accepted',
    rejected: 'Rejected',
    ghosted: 'Ghosted'
  };
  if (canonicalNames[category]) return canonicalNames[category];
  if (category === 'assessment') return 'OA';
  if (category === 'interview') {
    const interviewNumber = Number(trimmedStage.match(/\d+/)?.[0]) || 1;
    return `Interview ${interviewNumber}`;
  }
  return `${trimmedStage.charAt(0).toUpperCase()}${trimmedStage.slice(1)}`;
};

const normalizeCsvHeader = (header) => header.trim().toLowerCase().replace(/[^a-z0-9]/g, '');

const findCsvHeader = (headers, aliases) => {
  const normalizedAliases = new Set(aliases);
  return headers.find((header) => normalizedAliases.has(normalizeCsvHeader(header)));
};

export default function Room() {
  const { roomId } = useParams();
  return <RoomContent key={roomId} roomId={roomId} />;
}

function RoomContent({ roomId }) {
  const navigate = useNavigate();
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [uploaderName, setUploaderName] = useState(() => {
    try {
      return window.localStorage.getItem(`jobjobjob:uploader-name:${roomId}`) || '';
    } catch (error) {
      console.error('Could not restore the saved uploader name.', error);
      return '';
    }
  });
  const [isPanEnabled, setIsPanEnabled] = useState(true);

  const simulationRef = useRef(null);
  const d3NodesRef = useRef([]);
  const nodePositionsRef = useRef(new Map());

  const handleUploaderNameChange = (event) => {
    const name = event.target.value;
    setUploaderName(name);
    try {
      window.localStorage.setItem(`jobjobjob:uploader-name:${roomId}`, name);
    } catch (error) {
      console.error('Could not save the uploader name.', error);
      alert('Your name could not be saved in this browser. You can still upload your CSV.');
    }
  };

  const handleDeleteFriend = useCallback(async (node) => {
    const friendName = node.data.label;
    if (!window.confirm(`Delete ${friendName} and all of their uploaded entries from this room?`)) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'rooms', roomId, 'friends', friendName));
      nodePositionsRef.current.delete(node.id);
    } catch (error) {
      console.error(`Could not delete ${friendName}'s room entries.`, error);
      alert(`Could not delete ${friendName}'s entries. Please try again.`);
    }
  }, [roomId]);

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
    nodePositionsRef.current.set(node.id, node.position);
    if (!simulationRef.current || !node.id.startsWith('stage-')) return;
    const d3Node = d3NodesRef.current.find(n => n.id === node.id);
    if (d3Node) {
      d3Node.fx = node.position.x;
      d3Node.fy = node.position.y;
    }
  }, []);

  const onNodeDragStop = useCallback((event, node) => {
    nodePositionsRef.current.set(node.id, node.position);
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
      const orderedStages = [...uniqueStages].sort((a, b) => {
        return getStageProgress(a) - getStageProgress(b)
          || a.localeCompare(b);
      });
      const companyFurthestStages = new Map();
      const friendFurthestStages = new Map();

      allData.forEach((row) => {
        if (!row.Stages) return;

        const completedStages = row.Stages
          .split(',')
          .map(s => formatStageName(s.trim()));
        const furthestStage = getFurthestStage(completedStages);

        if (row.Company) {
          const previousCompanyStage = companyFurthestStages.get(row.Company);
          if (!previousCompanyStage
            || getStageProgress(furthestStage) > getStageProgress(previousCompanyStage)) {
            companyFurthestStages.set(row.Company, furthestStage);
          }
        }
        if (row.Friend) {
          const previousFriendStage = friendFurthestStages.get(row.Friend);
          if (!previousFriendStage
            || getStageProgress(furthestStage) > getStageProgress(previousFriendStage)) {
            friendFurthestStages.set(row.Friend, furthestStage);
          }
        }
      });

      const companiesByFurthestStage = new Map();
      uniqueCompanies.forEach((company) => {
        const stage = companyFurthestStages.get(company) || 'Unknown';
        const companies = companiesByFurthestStage.get(stage) || [];
        companies.push(company);
        companiesByFurthestStage.set(stage, companies);
      });
      const companyGroups = [...companiesByFurthestStage.entries()]
        .sort(([stageA], [stageB]) => {
          return getStageProgress(stageA) - getStageProgress(stageB);
        });

      // Dynamically calculate graph width based on the number of active middle stages
      const centerX = 600; 
      const stageSpacing = 190;
      const dynamicSpread = 350 + ((Math.max(1, orderedStages.length) - 1) * stageSpacing) / 2;
      const columnFriendsX = centerX - dynamicSpread;
      const columnCompaniesX = centerX + dynamicSpread;
      const friendColumns = Math.max(1, Math.ceil(Math.sqrt(uniqueFriends.length)));
      const friendRows = Math.ceil(uniqueFriends.length / friendColumns);
      const friendLayoutBottom = 100 + Math.max(0, friendRows - 1) * ENDPOINT_GRID_SPACING;
      let companyLayoutBottom = 100;
      let hasCompanyLayoutRows = false;
      const groupedCompanyNodes = companyGroups.flatMap(([stage, companies]) => {
        const columns = Math.max(1, Math.ceil(Math.sqrt(companies.length / 2)));
        const rows = Math.ceil(companies.length / columns);
        const groupStartY = hasCompanyLayoutRows ? companyLayoutBottom + 100 : 100;
        const groupNodes = companies.map((name, index) => {
          const size = getNodeSize(name);
          const row = Math.floor(index / columns);
          const column = index % columns;
          return {
            id: `company-${name}`,
            type: 'default',
            sourcePosition: Position.Right,
            targetPosition: Position.Left,
            position: nodePositionsRef.current.get(`company-${name}`) || {
              x: columnCompaniesX + column * ENDPOINT_GRID_SPACING,
              y: groupStartY + row * ENDPOINT_GRID_SPACING
            },
            data: { label: name },
            className: circleNodeClass,
            style: {
              borderRadius: '50%',
              width: size,
              height: size,
              borderColor: getOutcomeColor(stage)
            }
          };
        });
        companyLayoutBottom = groupStartY + (rows - 1) * ENDPOINT_GRID_SPACING;
        hasCompanyLayoutRows = true;
        return groupNodes;
      });
      const centerY = (100 + Math.max(friendLayoutBottom, companyLayoutBottom)) / 2;

      const friendNodes = uniqueFriends.map((name, index) => {
        const size = getNodeSize(name);
        const row = Math.floor(index / friendColumns);
        const column = index % friendColumns;
        return {
          id: `friend-${name}`,
          type: 'default',
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
          position: nodePositionsRef.current.get(`friend-${name}`) || {
            x: columnFriendsX - column * ENDPOINT_GRID_SPACING,
            y: 100 + row * ENDPOINT_GRID_SPACING
          },
          data: { label: name },
          className: circleNodeClass,
          style: { borderRadius: '50%', width: size, height: size }
        };
      });

      const stageNodes = orderedStages.map((stage, index) => {
        const existingNode = d3NodesRef.current.find(n => n.id === `stage-${stage}`);
        const size = getNodeSize(stage);
        const targetX = centerX + (index - (orderedStages.length - 1) / 2) * stageSpacing;

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

        const furthestStage = getFurthestStage(completedStages);
        const edgeColor = getOutcomeColor(furthestStage);
        const friendEdgeColor = getOutcomeColor(friendFurthestStages.get(row.Friend) || furthestStage);

        newEdges.push({
          id: `e-${row.Friend}-${completedStages[0]}-${index}-start`,
          source: `friend-${row.Friend}`,
          target: `stage-${completedStages[0]}`,
          markerEnd: { type: MarkerType.ArrowClosed, color: friendEdgeColor },
          style: { stroke: friendEdgeColor, strokeWidth: 2 }
        });

        for (let i = 0; i < completedStages.length - 1; i++) {
          const sourceStageColor = getOutcomeColor(completedStages[i]);
          newEdges.push({
            id: `e-${completedStages[i]}-${completedStages[i+1]}-${index}-mid`,
            source: `stage-${completedStages[i]}`,
            target: `stage-${completedStages[i+1]}`,
            markerEnd: { type: MarkerType.ArrowClosed, color: sourceStageColor },
            style: { stroke: sourceStageColor, strokeWidth: 2 },
            animated: true 
          });
        }

        newEdges.push({
          id: `e-${furthestStage}-${row.Company}-${index}-end`,
          source: `stage-${furthestStage}`,
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
        .force('x', forceX(d => d.targetX).strength(0.18)) 
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

        const preserveDraggedPositions = (sideNodes) => sideNodes.map((node) => ({
          ...node,
          position: nodePositionsRef.current.get(node.id) || node.position
        }));

        setNodes([
          ...preserveDraggedPositions(friendNodes),
          ...positionedStageNodes,
          ...preserveDraggedPositions(groupedCompanyNodes)
        ]);
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
        const headers = results.meta.fields || [];
        const companyHeader = findCsvHeader(headers, [
          'company',
          'companies',
          'companyname',
          'companynames',
          'employer',
          'employers',
          'organization',
          'organizations',
          'organisation',
          'organisations',
          'job',
          'jobs',
          'jobcompany'
        ]);
        const stagesHeader = findCsvHeader(headers, [
          'stage',
          'stages',
          'process',
          'processes',
          'result',
          'results',
          'status',
          'statuses',
          'applicationstage',
          'applicationstages',
          'hiringstage',
          'hiringstages',
          'hiringprocess',
          'interviewprocess'
        ]);

        if (!companyHeader || !stagesHeader) {
          const missingHeaders = [
            !companyHeader && 'company/jobs',
            !stagesHeader && 'stage/process'
          ].filter(Boolean);
          alert(`Could not identify the ${missingHeaders.join(' and ')} column${missingHeaders.length > 1 ? 's' : ''}. Please check your CSV headings.`);
          event.target.value = null;
          return;
        }

        const data = results.data;
        
        const formattedApplications = data.map(row => {
          const stagesRaw = row[stagesHeader]?.trim();
          return {
            Friend: uploaderName.trim(),
            Company: row[companyHeader]?.trim(),
            Stages: stagesRaw
          };
        }).filter(row => row.Company && row.Stages);

        if (formattedApplications.length === 0) {
          alert("Could not find any valid rows. Ensure the company/jobs column and stage/process column contain values.");
          event.target.value = null;
          return;
        }

        const batch = writeBatch(db);
        const friendRef = doc(db, 'rooms', roomId, 'friends', uploaderName.trim());
        batch.set(friendRef, { applications: formattedApplications });
        
        await batch.commit();
        event.target.value = null;
      }
    });
  };

  return (
    <div className="flex flex-col h-screen bg-slate-950 font-sans">
      <div className="p-4 bg-slate-900 border-b border-slate-800 flex flex-col sm:flex-row justify-between items-center gap-4 z-10 shadow-md">
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/')}
            aria-label="Return to home page"
            title="Home"
            className="flex items-center justify-center rounded-md p-1 hover:bg-slate-800 transition-colors"
          >
            <img src="/jjj logo trans.svg" alt="" className="w-12 h-12 object-contain" />
          </button>
          <div>
            <span className="text-slate-400 mr-2 text-sm">Room code:</span>
            <strong className="tracking-widest text-white">{roomId}</strong>
          </div>
          <div className="text-slate-600 hidden sm:block">|</div>
          <div className="text-sm text-slate-400">Share code to collaborate</div>
        </div>

        <div className="flex items-center gap-3">
          <input 
            type="text" 
            placeholder="Enter your name..."
            value={uploaderName}
            onChange={handleUploaderNameChange}
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
          onDeleteFriend={handleDeleteFriend}
          isPanEnabled={isPanEnabled}
          onPanEnabledChange={setIsPanEnabled}
        />
      </div>
    </div>
  );
}