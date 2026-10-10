import { MarkerType, Position } from 'reactflow';
import { GRAPH_SETTINGS } from '../graphSettings';
import { getClosestEdgeHandleId } from './edgeHandlePositions';

const STAGE_ORDER = [
  'Applied',
  'Online Assessment',
  'Screening',
  'Interview 1',
  'Interview 2',
  'Offer',
  'Rejected',
  'Ghosted',
  'Accepted'
];

const OUTCOME_COLORS = {
  rejected: '#ef4444',
  ghosted: '#374151',
  accepted: '#3b82f6',
  offered: '#22c55e',
  default: '#cbd5e1'
};

const circleNodeClass = 'bg-white text-slate-900 border-2 border-white rounded-full flex justify-center items-center font-bold shadow-lg';

export const getNodeSize = (label, fontSize) => {
  const words = (label || '').trim().split(/\s+/).filter(Boolean);
  const longestWordLength = words.reduce((widest, word) => Math.max(widest, word.length), 0);
  const widthPadding = 26;
  const heightPadding = Math.max(18, fontSize * 0.75);
  const textWidth = longestWordLength * fontSize * 0.72;
  const textHeight = Math.max(1, words.length) * fontSize * 1.05;
  return Math.max(82, textWidth + widthPadding, textHeight + heightPadding);
};

const getStageCategory = (stage) => {
  const normalizedStage = stage.toLowerCase().replace(/[^a-z]/g, '');
  if (normalizedStage.startsWith('reject')) return 'rejected';
  if (normalizedStage.startsWith('ghost')) return 'ghosted';
  if (normalizedStage.startsWith('accept')) return 'accepted';
  if (normalizedStage.startsWith('offer')) return 'offered';
  if (normalizedStage.startsWith('apply')) return 'applied';
  if (normalizedStage.startsWith('online') || normalizedStage.includes('assessment')) return 'assessment';
  if (normalizedStage.startsWith('screen') || normalizedStage.includes('phone')) return 'screening';
  if (normalizedStage.startsWith('interview')) return 'interview';
  return 'other';
};

const getStageProgress = (stage) => {
  const category = getStageCategory(stage);
  if (category === 'applied') return 0;
  if (category === 'assessment') return 1;
  if (category === 'screening') return 2;
  if (category === 'interview') {
    const interviewNumber = Number(stage.match(/\d+/)?.[0]);
    return interviewNumber ? 2 + interviewNumber : 3;
  }
  if (category === 'offered') return 6;
  if (category === 'accepted') return 7;
  if (category === 'rejected') return 8;
  if (category === 'ghosted') return 9;
  const knownStageIndex = STAGE_ORDER.indexOf(stage);
  return knownStageIndex === -1 ? 4 : knownStageIndex;
};

const getFurthestStage = (stages) => stages.reduce((furthest, stage) => (
  !furthest || getStageProgress(stage) > getStageProgress(furthest) ? stage : furthest
), '');

const getOutcomeColor = (stage) => OUTCOME_COLORS[getStageCategory(stage)] || OUTCOME_COLORS.default;

const getStageClass = () => (
  'bg-white text-slate-900 border-2 border-white rounded-full flex justify-center items-center font-bold shadow-lg text-center'
);

const getEdgeHandles = (sourceNode, targetNode) => {
  const sourceWidth = sourceNode.style?.width || 75;
  const sourceHeight = sourceNode.style?.height || 75;
  const targetWidth = targetNode.style?.width || 75;
  const targetHeight = targetNode.style?.height || 75;
  const sourceCenter = {
    x: sourceNode.position.x + sourceWidth / 2,
    y: sourceNode.position.y + sourceHeight / 2
  };
  const targetCenter = {
    x: targetNode.position.x + targetWidth / 2,
    y: targetNode.position.y + targetHeight / 2
  };
  const sourceSide = targetCenter.x >= sourceCenter.x ? 'right' : 'left';
  const targetSide = sourceSide === 'right' ? 'left' : 'right';

  return {
    sourceHandle: getClosestEdgeHandleId(
      targetCenter.x - sourceCenter.x,
      targetCenter.y - sourceCenter.y,
      sourceSide,
      'source'
    ),
    targetHandle: getClosestEdgeHandleId(
      sourceCenter.x - targetCenter.x,
      sourceCenter.y - targetCenter.y,
      targetSide,
      'target'
    )
  };
};

export function updateEdgeHandles(edges, nodes) {
  const nodesById = new Map(nodes.map(node => [node.id, node]));
  let changed = false;
  const updatedEdges = edges.map((edge) => {
    const sourceNode = nodesById.get(edge.source);
    const targetNode = nodesById.get(edge.target);
    if (!sourceNode || !targetNode) return edge;

    const handles = getEdgeHandles(sourceNode, targetNode);
    if (handles.sourceHandle === edge.sourceHandle && handles.targetHandle === edge.targetHandle) {
      return edge;
    }

    changed = true;
    return { ...edge, ...handles };
  });
  return changed ? updatedEdges : edges;
}

export function formatStageName(stageInput) {
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
  if (category === 'assessment') return 'Online Assessment';
  if (category === 'interview') {
    const interviewNumber = Number(trimmedStage.match(/\d+/)?.[0]) || 1;
    return `Interview ${interviewNumber}`;
  }
  return `${trimmedStage.charAt(0).toUpperCase()}${trimmedStage.slice(1)}`;
}

export function updateNodeFontSize(nodes, fontSize) {
  return nodes.map((node) => {
    const label = node.data?.label || '';
    const size = getNodeSize(label, fontSize);
    return {
      ...node,
      data: {
        ...node.data,
        displayLabel: label.trim().split(/\s+/).filter(Boolean).join('\n')
      },
      style: {
        ...node.style,
        width: size,
        height: size,
        fontSize
      },
      ...(node.radius !== undefined ? { radius: size / 2 } : {})
    };
  });
}

export function buildRoomGraph(allData, previousSimulationNodes, savedPositions, settings = GRAPH_SETTINGS) {
  const uniqueFriends = [...new Set(allData.map(row => row.Friend))].filter(Boolean);
  const uniqueCompanies = [...new Set(allData.map(row => row.Company))].filter(Boolean);
  const allStages = allData.flatMap(row => (
    row.Stages
      ? row.Stages.split(',').map(stage => formatStageName(stage.trim()))
      : []
  ));
  const uniqueStages = [...new Set(allStages)].filter(Boolean);

  const stageDepths = new Map();
  allData.forEach((row) => {
    if (!row.Stages) return;
    const completedStages = row.Stages.split(',').map(stage => formatStageName(stage.trim()));
    if (completedStages.length > 1) {
      completedStages.forEach((stage, index) => {
        const depth = index / (completedStages.length - 1);
        const current = stageDepths.get(stage) || { sum: 0, count: 0 };
        stageDepths.set(stage, { sum: current.sum + depth, count: current.count + 1 });
      });
    }
  });

  const getStageDepth = (stage) => {
    const depthData = stageDepths.get(stage);
    return depthData?.count
      ? depthData.sum / depthData.count
      : getStageProgress(stage) / 10;
  };
  const orderedStages = [...uniqueStages].sort((a, b) => {
    const diff = getStageDepth(a) - getStageDepth(b);
    return Math.abs(diff) > 0.001 ? diff : a.localeCompare(b);
  });

  const companyFurthestStages = new Map();
  const friendFurthestStages = new Map();
  allData.forEach((row) => {
    if (!row.Stages) return;
    const completedStages = row.Stages.split(',').map(stage => formatStageName(stage.trim()));
    const furthestStage = getFurthestStage(completedStages);
    if (row.Company) {
      const previousStage = companyFurthestStages.get(row.Company);
      if (!previousStage || getStageProgress(furthestStage) > getStageProgress(previousStage)) {
        companyFurthestStages.set(row.Company, furthestStage);
      }
    }
    if (row.Friend) {
      const previousStage = friendFurthestStages.get(row.Friend);
      if (!previousStage || getStageProgress(furthestStage) > getStageProgress(previousStage)) {
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
  const getCompanyGroupOrder = (stage) => {
    const category = getStageCategory(stage);
    if (category === 'accepted') return getStageProgress('Offer');
    if (category === 'offered') return getStageProgress('Accepted');
    return getStageProgress(stage);
  };
  const companyGroups = [...companiesByFurthestStage.entries()]
    .sort(([stageA], [stageB]) => getCompanyGroupOrder(stageA) - getCompanyGroupOrder(stageB));

  const centerX = 600;
  const dynamicSpread = settings.layout.baseSpread
    + ((Math.max(1, orderedStages.length) - 1) * settings.layout.stageSpacing) / 2;
  const columnFriendsX = centerX - dynamicSpread;
  const columnCompaniesX = centerX + dynamicSpread;
  const friendColumns = Math.max(1, Math.ceil(Math.sqrt(uniqueFriends.length)));
  const friendRows = Math.ceil(uniqueFriends.length / friendColumns);
  const friendLayoutBottom = 100
    + Math.max(0, friendRows - 1) * settings.layout.endpointGridSpacing;

  let companyLayoutBottom = 100;
  let hasCompanyLayoutRows = false;
  const companyNodes = companyGroups.flatMap(([, companies]) => {
    const clusterRadius = Math.max(120, Math.sqrt(companies.length) * 50);
    const targetY = hasCompanyLayoutRows
      ? companyLayoutBottom + clusterRadius + 50
      : 100 + clusterRadius;
    const groupNodes = companies.map((name) => {
      const existingNode = previousSimulationNodes.find(node => node.id === `company-${name}`);
      const size = getNodeSize(name, settings.nodes.fontSize);
      return {
        id: `company-${name}`,
        isCompany: true,
        type: 'dynamicCircle',
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        data: { label: name, displayLabel: name.trim().split(/\s+/).join('\n') },
        className: circleNodeClass,
        style: { borderRadius: '50%', width: size, height: size, fontSize: settings.nodes.fontSize },
        radius: size / 2,
        targetX: columnCompaniesX,
        targetY,
        x: existingNode
          ? existingNode.x
          : columnCompaniesX + (Math.random() - 0.5) * settings.physics.initialJitter,
        y: existingNode
          ? existingNode.y
          : targetY + (Math.random() - 0.5) * settings.physics.initialJitter,
        fx: existingNode?.fx ?? null,
        fy: existingNode?.fy ?? null
      };
    });
    companyLayoutBottom = targetY + clusterRadius;
    hasCompanyLayoutRows = true;
    return groupNodes;
  });

  const centerY = Math.max(400, (100 + Math.max(friendLayoutBottom, companyLayoutBottom)) / 2);
  const friendNodes = uniqueFriends.map((name, index) => {
    const size = getNodeSize(name, settings.nodes.fontSize);
    const row = Math.floor(index / friendColumns);
    const column = index % friendColumns;
    return {
      id: `friend-${name}`,
      type: 'dynamicCircle',
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      position: savedPositions.get(`friend-${name}`) || {
        x: columnFriendsX - column * settings.layout.endpointGridSpacing,
        y: 100 + row * settings.layout.endpointGridSpacing
      },
      data: { label: name, displayLabel: name.trim().split(/\s+/).filter(Boolean).join('\n') },
      className: circleNodeClass,
      style: { borderRadius: '50%', width: size, height: size, fontSize: settings.nodes.fontSize }
    };
  });

  const stageNodes = orderedStages.map((stage, index) => {
    const existingNode = previousSimulationNodes.find(node => node.id === `stage-${stage}`);
    const size = getNodeSize(stage, settings.nodes.fontSize);
    const targetX = centerX + (index - (orderedStages.length - 1) / 2)
      * settings.layout.stageSpacing;
    return {
      id: `stage-${stage}`,
      isCompany: false,
      type: 'dynamicCircle',
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      data: { label: stage, displayLabel: stage.trim().split(/\s+/).filter(Boolean).join('\n') },
      className: getStageClass(),
      style: { borderRadius: '50%', width: size, height: size, fontSize: settings.nodes.fontSize },
      radius: size / 2,
      targetX,
      targetY: centerY,
      x: existingNode
        ? existingNode.x
        : targetX + (Math.random() - 0.5) * settings.physics.initialJitter,
      y: existingNode
        ? existingNode.y
        : centerY + (Math.random() - 0.5) * settings.physics.initialJitter,
      fx: existingNode?.fx ?? null,
      fy: existingNode?.fy ?? null
    };
  });

  const simulationNodes = [...stageNodes, ...companyNodes];
  const nodeGeometryById = new Map([
    ...friendNodes,
    ...simulationNodes.map(node => ({
      ...node,
      position: { x: node.x, y: node.y }
    }))
  ].map(node => [node.id, node]));

  const edges = [];
  allData.forEach((row, index) => {
    if (!row.Friend || !row.Company || !row.Stages) return;
    const completedStages = row.Stages.split(',').map(stage => formatStageName(stage.trim()));
    if (completedStages.length === 0) return;
    const furthestStage = getFurthestStage(completedStages);
    const applicationColor = getOutcomeColor(furthestStage);

    edges.push({
      id: `e-${row.Friend}-${completedStages[0]}-${index}-start`,
      source: `friend-${row.Friend}`,
      target: `stage-${completedStages[0]}`,
      type: 'multi',
      markerEnd: { type: MarkerType.ArrowClosed, color: applicationColor },
      style: { stroke: applicationColor, strokeWidth: 2 }
    });

    for (let stageIndex = 0; stageIndex < completedStages.length - 1; stageIndex++) {
      const sourceStageColor = getOutcomeColor(completedStages[stageIndex]);
      edges.push({
        id: `e-${completedStages[stageIndex]}-${completedStages[stageIndex + 1]}-${index}-mid`,
        source: `stage-${completedStages[stageIndex]}`,
        target: `stage-${completedStages[stageIndex + 1]}`,
        type: 'multi',
        markerEnd: { type: MarkerType.ArrowClosed, color: sourceStageColor },
        style: { stroke: sourceStageColor, strokeWidth: 2 },
        animated: true
      });
    }

    const finalStageColor = getOutcomeColor(furthestStage);
    edges.push({
      id: `e-${furthestStage}-${row.Company}-${index}-end`,
      source: `stage-${furthestStage}`,
      target: `company-${row.Company}`,
      type: 'multi',
      markerEnd: { type: MarkerType.ArrowClosed, color: finalStageColor },
      style: { stroke: finalStageColor, strokeWidth: 2 }
    });
  });

  const edgeGroups = {};
  edges.forEach((edge) => {
    const key = `${edge.source}-${edge.target}`;
    if (!edgeGroups[key]) edgeGroups[key] = [];
    edgeGroups[key].push(edge);
  });
  Object.values(edgeGroups).forEach((group) => {
    group.forEach((edge, index) => {
      edge.data = { ...edge.data, offsetIndex: index, totalEdges: group.length };
    });
  });

  const edgesWithHandles = updateEdgeHandles(edges, [...nodeGeometryById.values()]);

  const attractionLinks = [];
  const attractionLinkKeys = new Set();
  allData.forEach((row) => {
    if (!row.Company || !row.Stages) return;
    const completedStages = row.Stages.split(',').map(stage => formatStageName(stage.trim()));
    const furthestStage = getFurthestStage(completedStages);
    if (!furthestStage) return;
    const source = `stage-${furthestStage}`;
    const target = `company-${row.Company}`;
    const key = JSON.stringify([source, target]);
    if (!attractionLinkKeys.has(key)) {
      attractionLinkKeys.add(key);
      attractionLinks.push({ source, target });
    }
  });

  return { friendNodes, simulationNodes, edges: edgesWithHandles, attractionLinks, centerY };
}
