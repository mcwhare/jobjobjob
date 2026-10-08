import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../firebaseConfig'; 
import { doc, getDoc, setDoc, collection, getDocs, query, limit } from 'firebase/firestore';

export default function Home() {
  const navigate = useNavigate();
  const [roomId, setRoomId] = useState('');
  const [isPrivacyModalOpen, setIsPrivacyModalOpen] = useState(false);
  const [error, setError] = useState('');
  const [isChecking, setIsChecking] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const handleCreateRoom = async () => {
    setIsCreating(true);
    setError('');
    
    try {
      let isUnique = false;
      let newRoomId = '';

      // Keep generating and checking until we find an unused ID
      while (!isUnique) {
        newRoomId = Math.random().toString(36).substring(2, 9);
        const roomSnap = await getDoc(doc(db, 'rooms', newRoomId));
        
        if (!roomSnap.exists()) {
          // Double-check legacy fallback just to be 100% safe
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
      // 1. Check if the parent room document exists (for newly created rooms)
      const roomSnap = await getDoc(doc(db, 'rooms', trimmedRoomId));
      
      if (roomSnap.exists()) {
        navigate(`/room/${encodeURIComponent(trimmedRoomId)}`);
        return;
      }

      // 2. Fallback for older rooms: check if the 'friends' subcollection has data
      const friendsSnap = await getDocs(query(collection(db, 'rooms', trimmedRoomId, 'friends'), limit(1)));
      
      if (!friendsSnap.empty) {
        navigate(`/room/${encodeURIComponent(trimmedRoomId)}`);
        return;
      }

      // If neither exists, block them and show an error
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
    // min-h-[100dvh] handles mobile browser toolbars better than min-h-screen
    <div
      className="flex flex-col items-center justify-center min-h-[100dvh] bg-[#060a14] font-sans p-4 sm:p-6 relative bg-cover bg-center overflow-x-hidden"
      style={{ backgroundImage: "url('/background.png')" }}
    >
      {/* Main Card Container */}
      <div className="bg-[#0a0f1c]/90 backdrop-blur-md border border-slate-800 rounded-3xl p-6 sm:p-10 md:p-14 w-full max-w-[48rem] flex flex-col items-center shadow-2xl z-10 my-auto">

        {/* Logo - scales from 5rem tall on mobile to 10rem on large desktops */}
        <img
          src="/jjj logo trans.svg"
          alt="JOB JOB JOB"
          className="h-20 sm:h-28 md:h-36 lg:h-40 mb-6 md:mb-8 object-contain"
        />

        {/* Tagline */}
        <h2 className="text-xl sm:text-2xl md:text-[1.7rem] font-bold mb-4 text-white text-center tracking-wide leading-tight">
          Visualise your friend group's job hunt.
        </h2>

        {/* Subtext - flows naturally on smaller screens */}
        <p className="text-slate-400 text-[11px] sm:text-xs text-center max-w-2xl mb-8 md:mb-12 leading-relaxed font-mono">
          Track applications, interviews, and offers together.<br></br> Create a room, invite your friends,
          follow everyone's progress.
        </p>
        <br></br><br></br>

        {/* Top Buttons Row - stacks on mobile, side-by-side on larger screens */}
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 mb-8 md:mb-12 w-full sm:w-auto">
          <button
            onClick={handleSeeExample}
            className="px-6 sm:px-8 py-3 text-sm font-bold rounded-lg bg-[#cbd5e1] text-slate-900 hover:bg-slate-300 transition-colors shadow-md w-full sm:w-auto text-center"
          >
            See Example
          </button>
          <button 
            onClick={handleCreateRoom}
            disabled={isCreating}
            className={`px-6 sm:px-8 py-3 text-sm font-bold rounded-lg text-white transition-colors shadow-lg shadow-blue-500/20 w-full sm:w-auto text-center ${isCreating ? 'bg-blue-800 cursor-not-allowed' : 'bg-[#0070f3] hover:bg-blue-600'}`}
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
                setError(''); // Clear error when typing
              }}
              placeholder="Enter Room Code:"
              aria-label="Room ID"
              required
              className="flex-1 min-w-0 px-4 py-3 rounded-lg bg-slate-800/80 text-white border border-slate-700 focus:outline-none focus:border-blue-500 text-sm placeholder:text-slate-500 font-mono"
            />
            <button
              type="submit"
              disabled={isChecking}
              className={`px-6 sm:px-8 py-3 text-sm font-bold rounded-lg text-white transition-colors shadow-md w-full sm:w-auto whitespace-nowrap ${isChecking ? 'bg-slate-600 cursor-not-allowed' : 'bg-[#334155] hover:bg-slate-500'}`}
            >
              {isChecking ? 'Checking...' : 'Join Room'}
            </button>
          </form>
          
          {/* Error Message Display */}
          {error && (
            <p className="text-red-400 text-xs mt-3 font-mono animate-pulse text-center">
              {error}
            </p>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="mt-6 flex flex-col items-center gap-2 text-[10px] text-slate-400 z-10 font-mono pb-2">
        <span>@mcwh 2026</span>
        <button
          onClick={() => setIsPrivacyModalOpen(true)}
          className="hover:text-white transition-colors"
        >
          Privacy Policy
        </button>
      </div>

      {/* Privacy Policy Modal */}
      {isPrivacyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm transition-opacity">
          <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col relative overflow-hidden">

            {/* Modal Header */}
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

            {/* Modal Scrollable Content */}
            <div className="p-5 sm:p-6 overflow-y-auto flex-1 text-slate-300 space-y-6 custom-scrollbar text-sm leading-relaxed">
              <h3 className="text-base sm:text-lg font-semibold text-white">Data Collection and Use</h3>
              <p>
                [Insert your full Privacy Policy text here. You can format it with standard HTML tags like paragraphs, lists, and headers.]
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}