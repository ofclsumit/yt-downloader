'use client';

import React, { useEffect, useState } from 'react';
import { Scissors, Activity, ShieldCheck, Zap } from 'lucide-react';

export function Navbar() {
  const [healthStatus, setHealthStatus] = useState<'healthy' | 'degraded' | 'checking'>('checking');

  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then((data) => {
        setHealthStatus(data.status === 'healthy' ? 'healthy' : 'degraded');
      })
      .catch(() => setHealthStatus('degraded'));
  }, []);

  return (
    <header className="w-full border-b border-white/10 glass-panel sticky top-0 z-40 backdrop-blur-xl">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-cyan-500 flex items-center justify-center shadow-glow">
            <Scissors className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-lg tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-100 to-slate-400">
                YT ClipEngine
              </span>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                PRO
              </span>
            </div>
            <p className="text-[11px] text-slate-400 hidden sm:block">
              Distributed Asynchronous Media Trimmer
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs">
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/60 border border-white/5 text-slate-300">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Direct R2 Storage</span>
          </div>

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/60 border border-white/5">
            <div
              className={`w-2 h-2 rounded-full animate-pulse ${
                healthStatus === 'healthy'
                  ? 'bg-emerald-400'
                  : healthStatus === 'checking'
                  ? 'bg-amber-400'
                  : 'bg-rose-400'
              }`}
            />
            <span className="text-slate-300 capitalize">
              {healthStatus === 'checking' ? 'Connecting...' : healthStatus}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
