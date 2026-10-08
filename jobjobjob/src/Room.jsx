import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Papa from 'papaparse';
import { applyNodeChanges } from 'reactflow';
import GraphView from './GraphView';
import TutorialArrows from './TutorialArrows';
import { buildRoomGraph, updateEdgeHandles } from './graphBuilder';

import { db } from '../firebaseConfig';
import { collection, deleteDoc, doc, onSnapshot, writeBatch } from 'firebase/firestore';
import { forceSimulation, forceY, forceX, forceManyBody, forceCollide, forceLink } from 'd3-force';
import { GRAPH_SETTINGS } from '../graphSettings';
import logoImage from './assets/jjj logo trans.svg';
import tutorialOne from './assets/tutorial1.png';
import tutorialTwo from './assets/tutorial2.png';

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
  const isExampleRoom = roomId === 'example';
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
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [hasCopied, setHasCopied] = useState(false);

  const handleCopyRoomId = () => {
    navigator.clipboard.writeText(roomId);
    setHasCopied(true);
    setTimeout(() => setHasCopied(false), 2000);
  };
  
  const [dismissedTutorialTargets, setDismissedTutorialTargets] = useState(() => {
    try {
      const savedTargets = JSON.parse(window.localStorage.getItem('jjj_tutorial_targets_seen') || '[]');
      return new Set(Array.isArray(savedTargets) ? savedTargets : []);
    } catch (error) {
      console.error('Could not restore tutorial progress.', error);
      return new Set();
    }
  });
  const tutorialTargetIds = isExampleRoom
    ? ['canvas', 'room-code', 'help']
    : ['canvas', 'room-code', 'name', 'upload', 'help'];
  const showTutorial = tutorialTargetIds.some((targetId) => !dismissedTutorialTargets.has(targetId));

  const handleTutorialTargetClick = useCallback((targetId) => {
    if (dismissedTutorialTargets.has(targetId)) return;
    const updated = new Set(dismissedTutorialTargets);
    updated.add(targetId);
    setDismissedTutorialTargets(updated);
    try {
      window.localStorage.setItem('jjj_tutorial_targets_seen', JSON.stringify([...updated]));
    } catch (error) {
      console.error('Could not save tutorial progress.', error);
    }
  }, [dismissedTutorialTargets]);

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
    if (isExampleRoom) {
      alert("Modifications are disabled in the example room.");
      return;
    }
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
  }, [isExampleRoom, roomId]);

  const onNodesChange = useCallback(
    (changes) => setNodes((nds) => applyNodeChanges(changes, nds)),
    []
  );

  const onNodeDragStart = useCallback((event, node) => {
    if (!simulationRef.current || (!node.id.startsWith('stage-') && !node.id.startsWith('company-'))) return;
    simulationRef.current.alphaTarget(0.3).restart();
    const d3Node = d3NodesRef.current.find(n => n.id === node.id);
    if (d3Node) {
      d3Node.fx = node.position.x;
      d3Node.fy = node.position.y;
    }
  }, []);

  const onNodeDrag = useCallback((event, node) => {
    nodePositionsRef.current.set(node.id, node.position);
    if (!simulationRef.current || (!node.id.startsWith('stage-') && !node.id.startsWith('company-'))) return;
    const d3Node = d3NodesRef.current.find(n => n.id === node.id);
    if (d3Node) {
      d3Node.fx = node.position.x;
      d3Node.fy = node.position.y;
    }
  }, []);

  const onNodeDragStop = useCallback((event, node) => {
    nodePositionsRef.current.set(node.id, node.position);
    if (!simulationRef.current || (!node.id.startsWith('stage-') && !node.id.startsWith('company-'))) return;
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

      const { friendNodes, simulationNodes, edges: graphEdges, attractionLinks } = buildRoomGraph(
        allData,
        d3NodesRef.current,
        nodePositionsRef.current
      );
      d3NodesRef.current = simulationNodes;
      setEdges(graphEdges);
      if (simulationRef.current) simulationRef.current.stop();

      simulationRef.current = forceSimulation(d3NodesRef.current)
        .force('collide', forceCollide(d => (d.radius || 55) + GRAPH_SETTINGS.physics.collisionRadiusOffset).strength(GRAPH_SETTINGS.physics.collisionStrength))
        .force('x', forceX(d => d.targetX).strength(d => d.isCompany ? GRAPH_SETTINGS.physics.xGravityCompany : GRAPH_SETTINGS.physics.xGravityStage))
        .force('y', forceY(d => d.targetY).strength(d => d.isCompany ? GRAPH_SETTINGS.physics.yGravityCompany : GRAPH_SETTINGS.physics.yGravityStage))
        .force('charge', forceManyBody().strength(d => (
          d.isCompany
            ? GRAPH_SETTINGS.physics.repulsionStrengthCompany
            : GRAPH_SETTINGS.physics.repulsionStrengthStage
        )))
        .force('stage-company-attraction', forceLink(attractionLinks)
          .id(node => node.id)
          .distance(link => Math.hypot(
            link.source.targetX - link.target.targetX,
            link.source.targetY - link.target.targetY
          ))
          .strength(GRAPH_SETTINGS.physics.stageCompanyAttractionStrength));

      simulationRef.current.on('tick', () => {
        const positionedSimNodes = d3NodesRef.current.map((node) => ({
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

        const currentNodes = [
          ...preserveDraggedPositions(friendNodes),
          ...positionedSimNodes
        ];
        setNodes(currentNodes);
        setEdges((currentEdges) => {
          return updateEdgeHandles(currentEdges, currentNodes);
        });
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
            <img src={logoImage} alt="" className="w-12 h-12 object-contain" />
          </button>
          <div className="flex items-center gap-2">
            <span className="text-slate-400 text-sm">Room code:</span>
            <button
              onClick={handleCopyRoomId}
              data-tutorial-target="room-code"
              className="group flex items-center gap-2 px-2 py-1 -ml-2 rounded-md hover:bg-slate-800 transition-colors cursor-pointer"
              title="Copy room code"
            >
              <strong className="tracking-widest text-white group-hover:text-blue-400 transition-colors">{roomId}</strong>
              {hasCopied ? (
                <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-4 h-4 text-slate-500 group-hover:text-blue-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              )}
            </button>
          </div>
          <div className="text-slate-600 hidden sm:block">|</div>
          <div className="text-sm text-slate-400">Share code to collaborate</div>
        </div>

        <div className="flex items-center gap-3">
          {/* Tutorial Button */}
          <button
            onClick={() => setIsModalOpen(true)}
            data-tutorial-target="help"
            className="w-9 h-9 flex items-center justify-center rounded-full bg-slate-800 border border-slate-700 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors shrink-0"
            title="How to use this app"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>

          {isExampleRoom ? (
            <div className="px-4 py-2 bg-slate-800/50 border border-slate-700 rounded-md text-slate-400 text-sm font-medium tracking-wide shadow-inner cursor-not-allowed">
              Read-Only Example
            </div>
          ) : (
            <>
              <input
                type="text"
                data-tutorial-target="name"
                placeholder="Enter your name..."
                value={uploaderName}
                onChange={handleUploaderNameChange}
                className="px-3 py-2 bg-slate-800 text-white border border-slate-700 rounded-md text-sm focus:outline-none focus:border-emerald-500 w-40"
              />
              <label
                data-tutorial-target="upload"
                className="cursor-pointer px-4 py-2 text-sm font-bold rounded-md bg-emerald-600 text-white hover:bg-emerald-500 transition-colors shadow-md flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                Upload CSV
                <input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
              </label>
            </>
          )}
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

      {/* Tutorial Modal */}
      {/* Tutorial Modal */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={() => setIsModalOpen(false)}
        >
          <div
            className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col relative overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >

            <div className="flex justify-between items-center p-5 border-b border-slate-800 bg-slate-900/50">
              <h2 className="text-xl font-bold text-white">How to format your CSV</h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-md hover:bg-slate-800 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 text-slate-300 space-y-8 custom-scrollbar">

              <div>
                <h3 className="text-lg font-semibold text-white mb-2">1. Set up your columns</h3>
                <p className="text-sm leading-relaxed mb-4">
                  Your spreadsheet must include two headers: <strong>Company</strong> and <strong>Results</strong>.
                </p>
                <div className="bg-slate-800 h-40 rounded-lg flex items-center justify-center border border-slate-700 overflow-hidden">
                  <img src={tutorialOne} alt="Column setup" className="w-full h-full object-cover" />
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-white mb-2">2. Enter your stages</h3>
                <p className="text-sm leading-relaxed mb-4">
                  Separate your interview pipeline stages with commas in the Results column. The specific stages we currently track are: <span className="text-emerald-400">Applied, Interview, Offer, Rejected, Accepted,</span> and <span className="text-emerald-400">Ghosted</span>.
                  You can add more stages, but the graph may look disorganised.
                </p>
                <div className="bg-slate-800 h-40 rounded-lg flex items-center justify-center border border-slate-700 overflow-hidden">
                  <img src={tutorialTwo} alt="Column setup" className="w-full h-full object-cover" />
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-white mb-2">3. Upload and merge</h3>
                <p className="text-sm leading-relaxed">
                  Export your spreadsheet as a <strong>.csv</strong> file. Enter your name in the top right box, click Upload CSV, and watch your timeline merge into the group's network.
                </p>
              </div>

            </div>
          </div>
        </div>
      )}
      {showTutorial && (
        <TutorialArrows
          dismissedTargets={dismissedTutorialTargets}
          onTargetClick={handleTutorialTargetClick}
          isExampleRoom={isExampleRoom}
        />
      )}
    </div>
  );
}