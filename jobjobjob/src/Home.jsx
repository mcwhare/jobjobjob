import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../firebaseConfig';
import { doc, getDoc, setDoc, collection, getDocs, query, limit } from 'firebase/firestore';

import bgImage from './assets/background.png';
import logoImage from './assets/jjj logo trans.svg';

export default function Home() {
  const navigate = useNavigate();
  const [roomId, setRoomId] = useState('');
  const [isPrivacyModalOpen, setIsPrivacyModalOpen] = useState(false);
  const [isUpdatesModalOpen, setIsUpdatesModalOpen] = useState(false);
  const [error, setError] = useState('');
  const [isChecking, setIsChecking] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const bgRef = useRef(null);

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!bgRef.current) return;
      
      const moveX = (0.5 - e.clientX / window.innerWidth) * 10; 
      const moveY = (0.5 - e.clientY / window.innerHeight) * 10;
      
      requestAnimationFrame(() => {
        if (bgRef.current) {
          bgRef.current.style.transform = `translate(${moveX}px, ${moveY}px) scale(1.05)`;
        }
      });
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  const handleCreateRoom = async () => {
    setIsCreating(true);
    setError('');

    try {
      let isUnique = false;
      let newRoomId = '';

      while (!isUnique) {
        newRoomId = Math.random().toString(36).substring(2, 9);
        const roomSnap = await getDoc(doc(db, 'rooms', newRoomId));

        if (!roomSnap.exists()) {
          const friendsSnap = await getDocs(query(collection(db, 'rooms', newRoomId, 'friends'), limit(1)));
          if (friendsSnap.empty) {
            isUnique = true;
          }
        }
      }

      await setDoc(doc(db, 'rooms', newRoomId), {
        createdAt: new Date().toISOString()
      });

      navigate(`/room/${newRoomId}`);
    } catch (err) {
      console.error("Error creating room:", err);
      setError("Could not create room. Please try again.");
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoinRoom = async (event) => {
    event.preventDefault();
    const trimmedRoomId = roomId.trim();
    if (!trimmedRoomId) return;

    setIsChecking(true);
    setError('');

    try {
      const roomSnap = await getDoc(doc(db, 'rooms', trimmedRoomId));

      if (roomSnap.exists()) {
        navigate(`/room/${encodeURIComponent(trimmedRoomId)}`);
        return;
      }

      const friendsSnap = await getDocs(query(collection(db, 'rooms', trimmedRoomId, 'friends'), limit(1)));

      if (!friendsSnap.empty) {
        navigate(`/room/${encodeURIComponent(trimmedRoomId)}`);
        return;
      }

      setError('Room not found. Please check the code and try again.');
    } catch (err) {
      console.error("Error joining room:", err);
      setError('An error occurred checking the room.');
    } finally {
      setIsChecking(false);
    }
  };

  const handleSeeExample = () => {
    navigate('/room/example');
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[100dvh] bg-[#060a14] font-sans p-4 sm:p-6 relative overflow-hidden">
      
      {/* Interactive Parallax Background Layer */}
      <div 
        ref={bgRef}
        className="absolute inset-0 z-0 bg-cover bg-center will-change-transform ease-out duration-75"
        style={{ 
          backgroundImage: `url("${bgImage}")`,
          transform: 'scale(1.05)'
        }} 
      />

      {/* Main Card Container */}
      <div className="relative z-10 bg-[#0a0f1c]/90 backdrop-blur-md border border-slate-800 rounded-3xl p-6 sm:p-10 md:p-14 w-full max-w-[48rem] flex flex-col items-center shadow-2xl my-auto">

        <img
          src={logoImage}
          alt="JOB JOB JOB"
          className="h-20 sm:h-28 md:h-36 lg:h-40 mb-6 md:mb-8 object-contain"
        />

        <h2 className="text-xl sm:text-2xl md:text-[1.7rem] font-bold font-sans mb-4 text-white text-center tracking-wide leading-tight">
          Visualise your friend group's job hunt.
        </h2>

        <p className="text-slate-400 text-[11px] sm:text-xs text-center max-w-2xl mb-8 md:mb-12 leading-relaxed font-mono">
          Track applications, interviews, and offers together.<br /> Create a room, invite your friends,
          follow everyone's progress.
        </p>

        {/* Top Buttons Row */}
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 mb-8 mt-4 md:mb-12 w-full sm:w-auto">
          <button 
            onClick={handleSeeExample}
            className="px-6 sm:px-8 py-3 text-sm font-bold rounded-lg bg-[#cbd5e1] text-slate-900 hover:bg-white transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 hover:shadow-lg shadow-md w-full sm:w-auto text-center cursor-pointer"
          >
            See Example
          </button>
          <button 
            onClick={handleCreateRoom}
            disabled={isCreating}
            className={`px-6 sm:px-8 py-3 text-sm font-bold rounded-lg text-white transition-all duration-200 w-full sm:w-auto text-center ${isCreating ? 'bg-blue-800 cursor-not-allowed shadow-none' : 'bg-[#0070f3] hover:bg-blue-500 hover:-translate-y-0.5 active:translate-y-0 shadow-lg shadow-blue-500/20 hover:shadow-blue-500/40 cursor-pointer'}`}
          >
            {isCreating ? 'Creating...' : 'Create New Room'}
          </button>
        </div>

        {/* Join Room Section */}
        <div className="flex flex-col items-center w-full max-w-[26rem]">
          <p className="text-[10px] sm:text-xs text-slate-300 mb-2 sm:mb-3 font-mono">Already have a code?</p>
          <form onSubmit={handleJoinRoom} className="flex flex-col sm:flex-row gap-3 w-full relative">
            <input
              type="text"
              value={roomId}
              onChange={(event) => {
                setRoomId(event.target.value);
                setError('');
              }}
              placeholder="Enter Room Code:"
              aria-label="Room ID"
              required
              className="flex-1 min-w-0 px-4 py-3 rounded-lg bg-slate-800/80 text-white border border-slate-700 focus:outline-none focus:border-blue-500 text-sm placeholder:text-slate-500 font-mono"
            />
            <button
              type="submit"
              disabled={isChecking}
              className={`px-6 sm:px-8 py-3 text-sm font-bold rounded-lg text-white transition-all duration-200 w-full sm:w-auto whitespace-nowrap ${isChecking ? 'bg-slate-600 cursor-not-allowed shadow-none' : 'bg-[#334155] hover:bg-slate-500 hover:-translate-y-0.5 active:translate-y-0 shadow-md hover:shadow-lg cursor-pointer'}`}
            >
              {isChecking ? 'Checking...' : 'Join Room'}
            </button>
          </form>

          {error && (
            <p className="text-red-400 text-xs mt-3 font-mono animate-pulse text-center">
              {error}
            </p>
          )}
        </div>
      </div>

      {/* Footer with Discrete Feature Updates Link */}
      <div className="mt-6 flex flex-col items-center gap-2 text-[10px] text-slate-400 z-10 font-mono pb-2">
        <span>@mcwh 2026</span>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsUpdatesModalOpen(true)}
            className="hover:text-white transition-colors underline decoration-slate-600 underline-offset-4 cursor-pointer"
          >
            What's New
          </button>
          <span>•</span>
          <button
            onClick={() => setIsPrivacyModalOpen(true)}
            className="hover:text-white transition-colors cursor-pointer"
          >
            Privacy Policy
          </button>
        </div>
      </div>

      {/* Feature Updates Modal */}
      {isUpdatesModalOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm transition-opacity"
          onClick={() => setIsUpdatesModalOpen(false)}
        >
          <div 
            className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col relative overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center p-4 sm:p-5 border-b border-slate-800 bg-slate-900/50">
              <h2 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
                Updates
              </h2>
              <button
                onClick={() => setIsUpdatesModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-md hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-5 sm:p-6 overflow-y-auto flex-1 text-slate-300 space-y-5 custom-scrollbar text-sm">
              <div className="border-b border-slate-800 pb-4">
                <div className="flex justify-between items-center mb-1">
                  <h3 className="font-bold text-white">Room Overview Stats</h3>
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-mono">Latest</span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Added a stats panel with a detailed breakdown.
                </p>
              </div>

              <div className="border-b border-slate-800 pb-4">
                <div className="flex justify-between items-center mb-1">
                  <h3 className="font-bold text-white">Interactive Onboarding & Tooltips</h3>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Introduced first-run tutorial arrows pointing and explaining core features.
                </p>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <h3 className="font-bold text-white">Graph Physics & Edge Routing</h3>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Upgraded React Flow layout algorithms with multi-edge separation and smooth D3 force simulations for clean network mapping.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Privacy Policy Modal */}
      {isPrivacyModalOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm transition-opacity"
          onClick={() => setIsPrivacyModalOpen(false)}
        >
          <div 
            className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col relative overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center p-4 sm:p-5 border-b border-slate-800 bg-slate-900/50">
              <h2 className="text-lg sm:text-xl font-bold text-white">Privacy Policy</h2>
              <button
                onClick={() => setIsPrivacyModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-md hover:bg-slate-800 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-5 sm:p-6 overflow-y-auto flex-1 text-slate-300 space-y-6 custom-scrollbar text-sm leading-relaxed">
              <h3 className="text-base sm:text-lg font-semibold text-white">Data Collection and Use</h3>
              <p>
                <p><strong>Effective Date:</strong> October 8, 2026</p>
                <br />

                <h2>1. Introduction</h2>
                <p>Welcome to <strong>JobJobJob</strong> ("we," "our," or "us"). We are committed to protecting your privacy while providing a seamless internship application network visualization service (the "Service"). This Privacy Policy explains how we collect, store, and protect your data when you use our Service. By accessing or using JobJobJob, you agree to the practices described in this policy.</p>
                <br />

                <h2>2. Information We Collect</h2>
                <p>JobJobJob is designed to minimize data collection. <strong>We do not require account creation, and we do not collect personal contact information such as names or email addresses.</strong></p>
                <ul>
                  <li><strong>Internship Data:</strong> We collect the specific job application data you manually input into the Service to generate your network graph. This may include company names, application statuses, and personally inputted names required to render the visualizer.</li>
                  <li><strong>Automatically Collected Data:</strong> As with most web services, our hosting infrastructure may automatically log basic, non-identifiable connection data (such as IP addresses or browser types) necessary for the secure and reliable routing of web traffic.</li>
                </ul>
                <br />

                <h2>3. How We Use Your Information</h2>
                <p>The data you provide is used strictly for a single purpose: <strong>to render and maintain your personal internship application network graph during your usage of the app.</strong></p>
                <ul>
                  <li>We do not use your data for marketing.</li>
                  <li>We do not send promotional emails or newsletters.</li>
                  <li>We do not aggregate, analyze, or publish anonymized statistics based on your application history.</li>
                </ul>
                <br />

                <h2>4. Data Storage, Retention, and Deletion</h2>
                <p>Your privacy and the temporal nature of job hunting are core to our data philosophy.</p>
                <ul>
                  <li><strong>Hosting Infrastructure:</strong> Your internship data is securely hosted using Firebase, with servers located in <strong>Australia</strong>.</li>
                  <li><strong>Automatic Deletion:</strong> All internship data submitted to JobJobJob is strictly temporary. <strong>Your data is automatically and permanently deleted from our servers two (2) months after it is created.</strong></li>
                  <li><strong>Manual Deletion:</strong> You retain full control over your data before the automatic deletion period. You can delete your internship graph data instantly using the deletion tools provided directly within the JobJobJob interface. Alternatively, you may contact us to request the manual deletion of your data. <em>(Note: Because we do not collect email addresses or require accounts, you may need to provide specific session details or graph identifiers for us to locate and delete your data manually).</em></li>
                </ul>
                <br />

                <h2>5. Information Sharing and Third Parties</h2>
                <p>Your application data is deeply personal, and <strong>we do not share, sell, or rent your data to any third parties.</strong></p>
                <ul>
                  <li><strong>No Analytics:</strong> We do not use third-party monitoring, tracking, or analytics tools (such as Google Analytics or similar services) to monitor your behavior on the platform.</li>
                  <li><strong>Service Providers:</strong> The only third party involved in our Service is our hosting and database provider, Firebase, which acts strictly as a data processor to store your information securely for the 2-month retention period.</li>
                </ul>
                <br />

                <h2>6. Age Restrictions</h2>
                <p>JobJobJob has no age restrictions and is open to all users who wish to visualize their application networks. We do not intentionally collect personally identifiable information from anyone, including minors.</p>
                <br />

                <h2>7. Changes to This Privacy Policy</h2>
                <p>We may update this Privacy Policy periodically to reflect changes in our technical operations or legal requirements. The updated version will be indicated by the "Effective Date" at the top of this document. We encourage you to review this policy whenever you return to the Service.</p>
                <br />

                <h2>8. Contact Us</h2>
                <p>If you have any questions, concerns, or manual data deletion requests regarding this Privacy Policy or your data, please contact us at:</p>
                <p><strong>Email:</strong> <a href="mailto:mcwhare05@gmail.com">mcwhare05@gmail.com</a></p>
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}