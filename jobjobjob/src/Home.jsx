import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Home() {
  const navigate = useNavigate();
  const [roomId, setRoomId] = useState('');
  const handleCreateRoom = () => navigate(`/room/${Math.random().toString(36).substring(2, 9)}`);
  const handleJoinRoom = (event) => {
    event.preventDefault();
    const trimmedRoomId = roomId.trim();
    if (trimmedRoomId) {
      navigate(`/room/${encodeURIComponent(trimmedRoomId)}`);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 text-white font-sans p-4">
      <h1 className="text-3xl md:text-4xl font-bold mb-3 text-center">Job Job Job</h1>
      <h2 className="text-xl md:text-2xl font-semibold mb-4 text-center">Visualise your friend group's job hunt.</h2>
      <p className="text-slate-400 mb-8 text-center max-w-md">Merge and visualize your friend group's hiring pipelines.</p>
      <div className="flex flex-col sm:flex-row items-stretch gap-3">
        <button 
          onClick={handleCreateRoom}
          className="px-6 py-3 text-base font-bold rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition-colors shadow-lg shadow-blue-500/20 cursor-pointer"
        >
          Start New Graph
        </button>
        <form onSubmit={handleJoinRoom} className="flex gap-2">
          <input
            type="text"
            value={roomId}
            onChange={(event) => setRoomId(event.target.value)}
            placeholder="Enter room ID"
            aria-label="Room ID"
            required
            className="min-w-0 w-40 px-3 py-2 rounded-lg bg-slate-800 text-white border border-slate-700 focus:outline-none focus:border-blue-500"
          />
          <button
            type="submit"
            className="px-6 py-3 text-base font-bold rounded-lg bg-slate-700 text-white hover:bg-slate-600 transition-colors cursor-pointer"
          >
            Join Room
          </button>
        </form>
      </div>
    </div>
  );
}