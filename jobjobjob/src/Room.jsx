import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Papa from 'papaparse';
import GraphView from './GraphView';
import TutorialArrows from './TutorialArrows';

import { db } from '../firebaseConfig';
import { collection, deleteDoc, doc, onSnapshot, writeBatch } from 'firebase/firestore';
import logoImage from './assets/jjj logo trans.svg';
import tutorialOne from './assets/tutorial1.png';
import tutorialTwo from './assets/tutorial2.png';

const normalizeCsvHeader = (header) => header.trim().toLowerCase().replace(/[^a-z0-9]/g, '');

const findCsvHeader = (headers, aliases) => {
  const normalizedAliases = new Set(aliases);
  return headers.find((header) => normalizedAliases.has(normalizeCsvHeader(header)));
};

const getStageCategory = (stage) => {
  const normalizedStage = (stage || '').toLowerCase().replace(/[^a-z]/g, '');
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
  if (category === 'interview') return 3;
  if (category === 'offered') return 6;
  if (category === 'accepted') return 7;
  if (category === 'rejected') return 8;
  if (category === 'ghosted') return 9;
  return 4;
};

const getFurthestStage = (stagesStr) => {
  if (!stagesStr) return '';
  const stages = stagesStr.split(',').map(s => s.trim());
  return stages.reduce((furthest, stage) => (
    !furthest || getStageProgress(stage) > getStageProgress(furthest) ? stage : furthest
  ), '');
};

export default function Room() {
  const { roomId } = useParams();
  return <RoomContent key={roomId} roomId={roomId} />;
}

function RoomContent({ roomId }) {
  const navigate = useNavigate();
  const isExampleRoom = roomId === 'example';
  const [applicationsData, setApplicationsData] = useState([]);

  const [activeTooltip, setActiveTooltip] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  const handleMouseMove = (e) => {
    setTooltipPos({ x: e.clientX, y: e.clientY });
  };

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
  const [isBreakdownOpen, setIsBreakdownOpen] = useState(false);
  const [isOverviewCollapsed, setIsOverviewCollapsed] = useState(false);

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

  const handleUploaderNameChange = (event) => {
    const name = event.target.value;
    setUploaderName(name);
    try {
      window.localStorage.setItem(`jobjobjob:uploader-name:${roomId}`, name);
    } catch (error) {
      console.error('Could not save the uploader name.', error);
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
      return true;
    } catch (error) {
      console.error(`Could not delete ${friendName}'s room entries.`, error);
      alert(`Could not delete ${friendName}'s entries. Please try again.`);
      return false;
    }
  }, [isExampleRoom, roomId]);

  useEffect(() => {
    const friendsRef = collection(db, 'rooms', roomId, 'friends');

    const unsubscribe = onSnapshot(friendsRef, (snapshot) => {
      const allData = [];
      snapshot.forEach(doc => {
        allData.push(...doc.data().applications);
      });

      setApplicationsData(allData);
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
          'company', 'companies', 'companyname', 'employer', 'employers', 'organization', 'organisation', 'job', 'jobs'
        ]);
        const stagesHeader = findCsvHeader(headers, [
          'stage', 'stages', 'process', 'processes', 'result', 'results', 'status', 'statuses', 'hiringstage', 'hiringprocess'
        ]);

        if (!companyHeader || !stagesHeader) {
          alert("Could not identify the company/jobs and stage/process columns. Please check your CSV headings.");
          event.target.value = null;
          return;
        }

        const formattedApplications = results.data.map(row => ({
          Friend: uploaderName.trim(),
          Company: row[companyHeader]?.trim(),
          Stages: row[stagesHeader]?.trim()
        })).filter(row => row.Company && row.Stages);

        if (formattedApplications.length === 0) {
          alert("Could not find any valid rows in your CSV.");
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

  // Overall calculations for the overview panel
  const totalApplications = applicationsData.length;
  const totalRejections = applicationsData.filter(app => getStageCategory(getFurthestStage(app.Stages)) === 'rejected').length;
  const totalCompanies = new Set(applicationsData.map(app => app.Company).filter(Boolean)).size;
  const totalInterviews = applicationsData.filter(app => {
    const stages = (app.Stages || '').split(',').map(s => s.trim());
    return stages.some(s => getStageCategory(s) === 'interview' || getStageProgress(s) >= 3);
  }).length;
  const totalOffers = applicationsData.filter(app => {
    const cat = getStageCategory(getFurthestStage(app.Stages));
    return cat === 'offered' || cat === 'accepted';
  }).length;

  const applicationsByFriend = applicationsData.reduce((acc, app) => {
    const friend = app.Friend || 'Unknown';
    if (!acc[friend]) acc[friend] = [];
    acc[friend].push(app);
    return acc;
  }, {});

  // 1. Top Contributor
  const friendCounts = applicationsData.reduce((acc, app) => {
    acc[app.Friend] = (acc[app.Friend] || 0) + 1;
    return acc;
  }, {});
  const topContributor = Object.entries(friendCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'None';

  // 2. Most Applied Company
  const companyCounts = applicationsData.reduce((acc, app) => {
    if (app.Company) acc[app.Company] = (acc[app.Company] || 0) + 1;
    return acc;
  }, {});
  const topCompanyEntry = Object.entries(companyCounts).sort((a, b) => b[1] - a[1])[0];
  const mostAppliedCompany = topCompanyEntry ? `${topCompanyEntry[0]} (${topCompanyEntry[1]})` : 'None';

  // 3. Group Offer Rate
  const totalAppsCount = applicationsData.length;
  const totalOffersCount = applicationsData.filter(app => {
    const cat = getStageCategory(getFurthestStage(app.Stages));
    return cat === 'offered' || cat === 'accepted';
  }).length;
  const groupOfferRate = totalAppsCount > 0 ? Math.round((totalOffersCount / totalAppsCount) * 100) : 0;

  // Most rejected/ghosted friend
  const friendGhostRejectionCounts = applicationsData.reduce((acc, app) => {
    if (app.Friend) {
      const cat = getStageCategory(getFurthestStage(app.Stages));
      if (cat === 'rejected' || cat === 'ghosted') {
        acc[app.Friend] = (acc[app.Friend] || 0) + 1;
      }
    }
    return acc;
  }, {});
  const topGhostRejectedEntry = Object.entries(friendGhostRejectionCounts).sort((a, b) => b[1] - a[1])[0];
  const mostRejectedFriend = topGhostRejectedEntry ? `${topGhostRejectedEntry[0]} (${topGhostRejectedEntry[1]})` : 'None';

  // Highest offer rate friend (minimum 1 application to qualify)
  const friendOfferStats = {};
  applicationsData.forEach(app => {
    if (!app.Friend) return;
    if (!friendOfferStats[app.Friend]) {
      friendOfferStats[app.Friend] = { total: 0, offers: 0 };
    }
    friendOfferStats[app.Friend].total += 1;
    const cat = getStageCategory(getFurthestStage(app.Stages));
    if (cat === 'offered' || cat === 'accepted') {
      friendOfferStats[app.Friend].offers += 1;
    }
  });

  let highestOfferRateFriend = 'None';
  let maxRate = -1;
  Object.entries(friendOfferStats).forEach(([friend, stats]) => {
    const rate = stats.total > 0 ? (stats.offers / stats.total) * 100 : 0;
    if (rate > maxRate) {
      maxRate = rate;
      highestOfferRateFriend = `${friend} (${Math.round(rate)}%)`;
    }
  });

  return (
    <div className="flex flex-col h-screen bg-slate-950 font-sans">
      <div className="p-4 bg-slate-900 border-b border-slate-800 flex flex-col sm:flex-row justify-between items-center gap-4 z-10 shadow-md">
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/')}
            aria-label="Return to home page"
            title="Home"
            className="flex items-center justify-center rounded-md p-1 hover:bg-slate-800 transition-colors cursor-pointer"
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
          <button
            onClick={() => setIsModalOpen(true)}
            data-tutorial-target="help"
            className="w-9 h-9 flex items-center justify-center rounded-full bg-slate-800 border border-slate-700 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors shrink-0 cursor-pointer"
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
          applicationsData={applicationsData}
          onDeleteFriend={handleDeleteFriend}
          isPanEnabled={isPanEnabled}
          onPanEnabledChange={setIsPanEnabled}
        />

        {/* Top-Right Popup Panel / Room Overview */}
        <div className="absolute top-4 right-4 z-20">
          <div className={`bg-slate-900/95 border border-slate-700/80 rounded-xl shadow-2xl backdrop-blur-md overflow-hidden transition-all duration-300 ease-in-out ${isOverviewCollapsed ? 'w-28 p-2' : 'w-80 sm:w-96 p-4'}`}>

            {isOverviewCollapsed ? (
              <button
                onClick={() => setIsOverviewCollapsed(false)}
                className="w-full py-1.5 px-2 text-sm font-bold text-slate-200 hover:text-white transition-colors flex items-center justify-between cursor-pointer"
              >
                <span>Stats</span>
                <svg className="w-4 h-4 transition-transform duration-300 rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" />
                </svg>
              </button>
            ) : (
              <div>
                <div className="flex justify-between items-center mb-3">
                  <h3 className="text-base font-bold text-white tracking-wide">Room overview</h3>
                  <button
                    onClick={() => setIsOverviewCollapsed(true)}
                    className="px-2.5 py-1 text-xs font-semibold rounded-md bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white transition-colors flex items-center gap-1.5 cursor-pointer border border-slate-700"
                  >
                    Collapse
                    <svg className="w-3.5 h-3.5 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" />
                    </svg>
                  </button>
                </div>

                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="bg-slate-800/80 border border-slate-700/60 rounded-lg p-3 shadow-inner">
                      <span className="block text-xs font-medium text-slate-400">Total Applications</span>
                      <span className="text-2xl font-black text-white">{totalApplications}</span>
                    </div>
                    <div className="bg-slate-800/80 border border-slate-700/60 rounded-lg p-3 shadow-inner">
                      <span className="block text-xs font-medium text-slate-400">Total Rejections</span>
                      <span className="text-2xl font-black text-red-400">{totalRejections}</span>
                    </div>
                    <div className="bg-slate-800/80 border border-slate-700/60 rounded-lg p-3 shadow-inner">
                      <span className="block text-xs font-medium text-slate-400">Total Companies</span>
                      <span className="text-2xl font-black text-blue-400">{totalCompanies}</span>
                    </div>
                    <div className="bg-slate-800/80 border border-slate-700/60 rounded-lg p-3 shadow-inner">
                      <span className="block text-xs font-medium text-slate-400">Total Offers</span>
                      <span className="text-2xl font-black text-emerald-400">{totalOffers}</span>
                    </div>
                  </div>

                  <button
                    onClick={() => setIsBreakdownOpen(true)}
                    className="w-full mt-1 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-bold shadow-md hover:shadow-lg transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    View breakdown
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                    </svg>
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>

      {/* Breakdown Modal */}
      {isBreakdownOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
          onClick={() => setIsBreakdownOpen(false)}
        >
          <div
            className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col relative overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center p-5 border-b border-slate-800 bg-slate-900/50">
              <div>
                <h2 className="text-xl font-bold text-white">Detailed Breakdown</h2>
                <p className="text-xs text-slate-400 mt-0.5">Summary of each friend's stats.</p>
              </div>
              <button
                onClick={() => setIsBreakdownOpen(false)}
                className="text-slate-400 hover:text-white p-1.5 rounded-md hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 space-y-6 custom-scrollbar relative">
              {applicationsData.length === 0 ? (
                <div className="text-center py-10 text-slate-500">No applications uploaded yet.</div>
              ) : (
                (() => {
                  // Global Room Stats Calculations
                  const friendCounts = applicationsData.reduce((acc, app) => {
                    if (app.Friend) acc[app.Friend] = (acc[app.Friend] || 0) + 1;
                    return acc;
                  }, {});
                  const topContributorEntry = Object.entries(friendCounts).sort((a, b) => b[1] - a[1])[0];
                  const topContributor = topContributorEntry ? `${topContributorEntry[0]} (${topContributorEntry[1]})` : 'None';

                  const companyCounts = applicationsData.reduce((acc, app) => {
                    if (app.Company) acc[app.Company] = (acc[app.Company] || 0) + 1;
                    return acc;
                  }, {});
                  const topCompanyEntry = Object.entries(companyCounts).sort((a, b) => b[1] - a[1])[0];
                  const mostAppliedCompany = topCompanyEntry ? `${topCompanyEntry[0]} (${topCompanyEntry[1]})` : 'None';

                  const totalAppsCount = applicationsData.length;
                  const totalOffersCount = applicationsData.filter(app => {
                    const cat = getStageCategory(getFurthestStage(app.Stages));
                    return cat === 'offered' || cat === 'accepted';
                  }).length;
                  const groupOfferRate = totalAppsCount > 0 ? Math.round((totalOffersCount / totalAppsCount) * 100) : 0;

                  const totalRejectionsCount = applicationsData.filter(app => getStageCategory(getFurthestStage(app.Stages)) === 'rejected').length;
                  const totalGhostedCount = applicationsData.filter(app => getStageCategory(getFurthestStage(app.Stages)) === 'ghosted').length;
                  const ghostingRejectionRatio = `${totalGhostedCount} : ${totalRejectionsCount}`;

                  const friendGhostRejectionCounts = applicationsData.reduce((acc, app) => {
                    if (app.Friend) {
                      const cat = getStageCategory(getFurthestStage(app.Stages));
                      if (cat === 'rejected' || cat === 'ghosted') {
                        acc[app.Friend] = (acc[app.Friend] || 0) + 1;
                      }
                    }
                    return acc;
                  }, {});
                  const topGhostRejectedEntry = Object.entries(friendGhostRejectionCounts).sort((a, b) => b[1] - a[1])[0];
                  const mostRejectedFriend = topGhostRejectedEntry ? `${topGhostRejectedEntry[0]} (${topGhostRejectedEntry[1]})` : 'None';

                  const friendOfferStats = {};
                  applicationsData.forEach(app => {
                    if (!app.Friend) return;
                    if (!friendOfferStats[app.Friend]) {
                      friendOfferStats[app.Friend] = { total: 0, offers: 0 };
                    }
                    friendOfferStats[app.Friend].total += 1;
                    const cat = getStageCategory(getFurthestStage(app.Stages));
                    if (cat === 'offered' || cat === 'accepted') {
                      friendOfferStats[app.Friend].offers += 1;
                    }
                  });

                  let highestOfferRateFriend = 'None';
                  let maxRate = -1;
                  Object.entries(friendOfferStats).forEach(([friend, stats]) => {
                    const rate = stats.total > 0 ? (stats.offers / stats.total) * 100 : 0;
                    if (rate > maxRate) {
                      maxRate = rate;
                      highestOfferRateFriend = `${friend} (${Math.round(rate)}%)`;
                    }
                  });

                  return (
                    <div className="space-y-6">
                      
                      {/* Global Room Summary 3x2 Grid */}
                      <div className="bg-slate-800/40 border border-slate-700/60 rounded-xl p-4 shadow-inner">
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Room Overview Analytics</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-4">
                          
                          {/* Card 1 */}
                          <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-3 flex flex-col justify-between transition-all duration-200 hover:border-emerald-500/50 hover:bg-slate-800 hover:scale-[1.02] cursor-pointer shadow-md relative group">
                            <div className="absolute -top-10 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-30 bg-slate-800 border border-slate-600 text-slate-200 text-xs px-3 py-1.5 rounded-lg shadow-xl whitespace-nowrap">
                              Friend who sent the most applications.
                            </div>
                            <span className="text-xs font-medium text-slate-400">The Overachiever</span>
                            <span className="text-base font-bold text-emerald-400 mt-1 truncate">{topContributor}</span>
                          </div>

                          {/* Card 2 */}
                          <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-3 flex flex-col justify-between transition-all duration-200 hover:border-blue-500/50 hover:bg-slate-800 hover:scale-[1.02] cursor-pointer shadow-md relative group">
                            <div className="absolute -top-10 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-30 bg-slate-800 border border-slate-600 text-slate-200 text-xs px-3 py-1.5 rounded-lg shadow-xl whitespace-nowrap">
                              Most applied to company.
                            </div>
                            <span className="text-xs font-medium text-slate-400">The Crowd Favourite </span>
                            <span className="text-base font-bold text-blue-400 mt-1 truncate">{mostAppliedCompany}</span>
                          </div>

                          {/* Card 3 */}
                          <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-3 flex flex-col justify-between transition-all duration-200 hover:border-amber-500/50 hover:bg-slate-800 hover:scale-[1.02] cursor-pointer shadow-md relative group">
                            <div className="absolute -top-10 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-30 bg-slate-800 border border-slate-600 text-slate-200 text-xs px-3 py-1.5 rounded-lg shadow-xl whitespace-nowrap">
                              % of apps getting an Offer/Accepted.
                            </div>
                            <span className="text-xs font-medium text-slate-400">Group Offer Rate</span>
                            <span className="text-base font-bold text-amber-400 mt-1">{groupOfferRate}%</span>
                          </div>

                          {/* Card 4 */}
                          <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-3 flex flex-col justify-between transition-all duration-200 hover:border-amber-500/50 hover:bg-slate-800 hover:scale-[1.02] cursor-pointer shadow-md relative group">
                            <div className="absolute -top-10 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-30 bg-slate-800 border border-slate-600 text-slate-200 text-xs px-3 py-1.5 rounded-lg shadow-xl whitespace-nowrap">
                              Ratio of ghosted apps versus formal rejections.
                            </div>
                            <span className="text-xs font-medium text-slate-400">Ghosted : Rejected Ratio</span>
                            <span className="text-base font-bold text-amber-400 mt-1">{ghostingRejectionRatio}</span>
                          </div>

                          {/* Card 5 */}
                          <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-3 flex flex-col justify-between transition-all duration-200 hover:border-red-500/50 hover:bg-slate-800 hover:scale-[1.02] cursor-pointer shadow-md relative group">
                            <div className="absolute -top-10 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-30 bg-slate-800 border border-slate-600 text-slate-200 text-xs px-3 py-1.5 rounded-lg shadow-xl whitespace-nowrap">
                              Friend with highest combined rejections and ghosted apps.
                            </div>
                            <span className="text-xs font-medium text-slate-400">The Unwanted</span>
                            <span className="text-base font-bold text-red-400 mt-1 truncate">{mostRejectedFriend}</span>
                          </div>

                          {/* Card 6 */}
                          <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-3 flex flex-col justify-between transition-all duration-200 hover:border-emerald-400/50 hover:bg-slate-800 hover:scale-[1.02] cursor-pointer shadow-md relative group">
                            <div className="absolute -top-10 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-30 bg-slate-800 border border-slate-600 text-slate-200 text-xs px-3 py-1.5 rounded-lg shadow-xl whitespace-nowrap">
                              Friend with the highest offer success ratio.
                            </div>
                            <span className="text-xs font-medium text-slate-400">The Chosen One</span>
                            <span className="text-base font-bold text-emerald-300 mt-1 truncate">{highestOfferRateFriend}</span>
                          </div>

                        </div>
                      </div>

                      {/* Individual Participant Cards */}
                      <div className="space-y-4">
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Friend Stats</h3>
                        {Object.entries(applicationsByFriend).map(([friendName, apps]) => {
                          const totalApps = apps.length;
                          const interviews = apps.filter(app => {
                            const stages = (app.Stages || '').split(',').map(s => s.trim());
                            return stages.some(s => getStageCategory(s) === 'interview' || getStageProgress(s) >= 3);
                          }).length;
                          const rejections = apps.filter(app => getStageCategory(getFurthestStage(app.Stages)) === 'rejected').length;
                          const offers = apps.filter(app => {
                            const cat = getStageCategory(getFurthestStage(app.Stages));
                            return cat === 'offered' || cat === 'accepted';
                          }).length;
                          
                          const acceptedApps = apps.filter(app => getStageCategory(getFurthestStage(app.Stages)) === 'accepted');
                          const acceptedCompanies = acceptedApps.length > 0 ? acceptedApps.map(a => a.Company).join(', ') : 'None';

                          let longestApp = { Company: 'None', count: 0 };
                          apps.forEach(app => {
                            const stageCount = (app.Stages || '').split(',').length;
                            if (stageCount > longestApp.count) {
                              longestApp = { Company: app.Company, count: stageCount };
                            }
                          });

                          const instantRejections = apps.filter(app => {
                            const stages = (app.Stages || '').split(',').map(s => s.trim());
                            if (stages.length <= 2) {
                              const finalCat = getStageCategory(stages[stages.length - 1]);
                              return finalCat === 'rejected' || finalCat === 'ghosted';
                            }
                            return false;
                          }).length;

                          return (
                            <div key={friendName} className="bg-slate-800/60 border border-slate-700/80 rounded-xl p-4 shadow-md">
                              <div className="flex items-center justify-between mb-4 border-b border-slate-700/50 pb-2">
                                <h4 className="text-base font-bold text-white flex items-center gap-2">
                                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                                  {friendName}
                                </h4>
                              </div>

                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-4">
                                
                                <div className="bg-slate-900/70 border border-slate-800 rounded-lg p-3 transition-all duration-200 hover:border-slate-500 hover:bg-slate-800 hover:scale-[1.02] cursor-pointer relative group">
                                  <div className="absolute -top-10 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-30 bg-slate-800 border border-slate-600 text-slate-200 text-xs px-3 py-1.5 rounded-lg shadow-xl whitespace-nowrap">
                                    Total job applications submitted.
                                  </div>
                                  <span className="block text-xs font-medium text-slate-400">Applications</span>
                                  <span className="text-xl font-black text-white">{totalApps}</span>
                                </div>

                                <div className="bg-slate-900/70 border border-slate-800 rounded-lg p-3 transition-all duration-200 hover:border-blue-500/50 hover:bg-slate-800 hover:scale-[1.02] cursor-pointer relative group">
                                  <div className="absolute -top-10 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-30 bg-slate-800 border border-slate-600 text-slate-200 text-xs px-3 py-1.5 rounded-lg shadow-xl whitespace-nowrap">
                                    Applications that progressed to interview or assessment stages.
                                  </div>
                                  <span className="block text-xs font-medium text-slate-400">Interviews</span>
                                  <span className="text-xl font-black text-white">{interviews}</span>
                                </div>

                                <div className="bg-slate-900/70 border border-slate-800 rounded-lg p-3 transition-all duration-200 hover:border-red-500/50 hover:bg-slate-800 hover:scale-[1.02] cursor-pointer relative group">
                                  <div className="absolute -top-10 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-30 bg-slate-800 border border-slate-600 text-slate-200 text-xs px-3 py-1.5 rounded-lg shadow-xl whitespace-nowrap">
                                    Applications that were rejected.
                                  </div>
                                  <span className="block text-xs font-medium text-slate-400">Rejections</span>
                                  <span className="text-xl font-black text-red-400">{rejections}</span>
                                </div>

                                <div className="bg-slate-900/70 border border-slate-800 rounded-lg p-3 transition-all duration-200 hover:border-emerald-500/50 hover:bg-slate-800 hover:scale-[1.02] cursor-pointer relative group">
                                  <div className="absolute -top-10 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-30 bg-slate-800 border border-slate-600 text-slate-200 text-xs px-3 py-1.5 rounded-lg shadow-xl whitespace-nowrap">
                                    Applications that converted into job offers.
                                  </div>
                                  <span className="block text-xs font-medium text-slate-400">Offers</span>
                                  <span className="text-xl font-black text-emerald-400">{offers}</span>
                                </div>

                                <div className="bg-slate-900/70 border border-slate-800 rounded-lg p-3 col-span-2 sm:col-span-1 transition-all duration-200 hover:border-emerald-400/50 hover:bg-slate-800 hover:scale-[1.02] cursor-pointer relative group">
                                  <div className="absolute -top-10 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-30 bg-slate-800 border border-slate-600 text-slate-200 text-xs px-3 py-1.5 rounded-lg shadow-xl whitespace-nowrap">
                                    Companies that accepted the applicant.
                                  </div>
                                  <span className="block text-xs font-medium text-slate-400">Accepted</span>
                                  <span className="text-sm font-bold text-blue-400 truncate block mt-0.5" title={acceptedCompanies}>
                                    {acceptedCompanies}
                                  </span>
                                </div>

                                <div className="bg-slate-900/70 border border-slate-800 rounded-lg p-3 col-span-2 sm:col-span-3 transition-all duration-200 hover:border-slate-600 hover:bg-slate-800 cursor-pointer relative group">
                                  <div className="absolute -top-10 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-30 bg-slate-800 border border-slate-600 text-slate-200 text-xs px-3 py-1.5 rounded-lg shadow-xl whitespace-nowrap">
                                    Highlights the longest interview loop and instant rejections or ghosting occurrences.
                                  </div>
                                  <div className="flex justify-between items-center text-xs">
                                    <span className="font-medium text-slate-400">Longest Process:</span>
                                    <span className="text-white font-bold">{longestApp.Company} ({longestApp.count} stages)</span>
                                  </div>
                                  <div className="flex justify-between items-center text-xs mt-1.5 pt-1.5 border-t border-slate-800">
                                    <span className="font-medium text-slate-400">Instant Rejections / Ghosted:</span>
                                    <span className="text-red-400 font-bold">{instantRejections}</span>
                                  </div>
                                </div>

                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()
              )}
            </div>
          </div>
        </div>
      )}

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
                className="text-slate-400 hover:text-white p-1 rounded-md hover:bg-slate-800 transition-colors cursor-pointer"
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