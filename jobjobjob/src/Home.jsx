import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function Home() {
  const navigate = useNavigate();
  const handleCreateRoom = () => navigate(`/room/${Math.random().toString(36).substring(2, 9)}`);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 text-white font-sans p-4">
      <h1 className="text-3xl md:text-4xl font-bold mb-3 text-center">Internship Application Tracker</h1>
      <p className="text-slate-400 mb-8 text-center max-w-md">Merge and visualize your friend group's hiring pipelines.</p>
      <button 
        onClick={handleCreateRoom}
        className="px-6 py-3 text-base font-bold rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition-colors shadow-lg shadow-blue-500/20 cursor-pointer"
      >
        Start New Graph
      </button>
    </div>
  );
}