'use client';

import { useEffect, useState, useCallback } from 'react';
import { getSocket } from '@/lib/socket';
import { motion, AnimatePresence } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import ReactConfetti from 'react-confetti';

// ── Types ──
interface Participant {
  id: string;
  name: string;
  score: number;
  totalTime: number;
  answeredCount: number;
  correctCount: number;
  currentAnswer: string | null;
  currentTime: number | null;
  isAI?: boolean;
}

interface RoundInfo {
  number: number;
  name: string;
  subtitle: string;
  emoji: string;
}

interface QuestionStats {
  totalAnswered: number;
  correctCount: number;
  wrongCount: number;
  fastestTime: number;
  avgTime: number;
  fastestCorrectName: string;
  totalPlayers: number;
  aiStats: {
    aiAnswer: string | null;
    aiTime: number | null;
    aiCorrect: boolean;
  } | null;
}

interface HostGameState {
  status: string;
  currentQuestionIndex: number;
  totalQuestions: number;
  currentQuestion: {
    id: number;
    question: string;
    options: string[];
    correct: string;
    aiResponse: string;
  } | null;
  timeRemaining: number;
  participants: Participant[];
  leaderboard: Participant[];
  stats: QuestionStats | null;
  sessionCode: string;
  aiPlayer: Participant | null;
  roundInfo: RoundInfo;
  isNewRound: boolean;
  currentRound: number;
}

const ROUND_COLORS: Record<number, { bg: string; border: string; text: string; glow: string }> = {
  1: { bg: 'bg-cyan-500/10', border: 'border-cyan-500/30', text: 'text-cyan-400', glow: 'shadow-cyan-500/20' },
  2: { bg: 'bg-amber-500/10', border: 'border-amber-500/30', text: 'text-amber-400', glow: 'shadow-amber-500/20' },
  3: { bg: 'bg-green-500/10', border: 'border-green-500/30', text: 'text-green-400', glow: 'shadow-green-500/20' },
};

// ── Stat Card ──
function StatCard({ label, value, icon, color = 'brand' }: {
  label: string; value: string | number; icon: string; color?: string;
}) {
  const colorMap: Record<string, string> = {
    brand: 'from-brand-500 to-brand-700',
    green: 'from-green-500 to-green-700',
    red: 'from-red-500 to-red-700',
    orange: 'from-orange-500 to-orange-700',
    pink: 'from-pink-500 to-pink-700',
    teal: 'from-teal-500 to-teal-700',
    gold: 'from-amber-500 to-amber-700',
    cyan: 'from-cyan-500 to-cyan-700',
  };

  return (
    <div className="stat-card">
      <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${colorMap[color] || colorMap.brand} flex items-center justify-center text-lg mb-2`}>
        {icon}
      </div>
      <p className="text-2xl font-extrabold">{value}</p>
      <p className="text-xs text-gray-400 mt-1">{label}</p>
    </div>
  );
}

// ── Timer Ring ──
function TimerRing({ time, total }: { time: number; total: number }) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const progress = (time / total) * circumference;
  const isUrgent = time <= 5;

  return (
    <div className="relative w-32 h-32">
      <svg className="countdown-ring w-32 h-32" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r={radius} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="8" />
        <circle
          cx="60" cy="60" r={radius} fill="none"
          stroke={isUrgent ? '#ef4444' : '#6366f1'}
          strokeWidth="8" strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - progress}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={`text-4xl font-black ${isUrgent ? 'text-red-400 animate-pulse' : 'text-white'}`}>
          {time}
        </span>
      </div>
    </div>
  );
}

// ── Round Banner ──
function RoundBanner({ roundInfo, currentRound }: { roundInfo: RoundInfo; currentRound: number }) {
  const colors = ROUND_COLORS[currentRound] || ROUND_COLORS[1];
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`${colors.bg} ${colors.border} border rounded-2xl p-4 text-center`}
    >
      <div className="flex items-center justify-center gap-3">
        <span className="text-2xl">{roundInfo.emoji}</span>
        <div>
          <p className={`text-sm font-bold uppercase tracking-wider ${colors.text}`}>
            Round {roundInfo.number} — {roundInfo.name}
          </p>
          <p className="text-xs text-gray-400">{roundInfo.subtitle}</p>
        </div>
        <span className="text-2xl">{roundInfo.emoji}</span>
      </div>
    </motion.div>
  );
}

// ── AI Score Card ──
function AIScoreCard({ aiPlayer, humanParticipants }: { aiPlayer: Participant | null; humanParticipants: Participant[] }) {
  if (!aiPlayer) return null;

  const topHumanScore = humanParticipants.length > 0
    ? Math.max(...humanParticipants.map(p => p.score))
    : 0;
  const humansBeatingAI = humanParticipants.filter(p => p.score > aiPlayer.score).length;
  const aiWinning = aiPlayer.score > topHumanScore;

  return (
    <div className="glass-card p-5 border border-cyan-500/20">
      <h3 className="text-sm font-bold uppercase tracking-wider text-cyan-400 mb-4 text-center">
        🧠 Are You Smarter?
      </h3>
      <div className="grid grid-cols-2 gap-3">
        <div className={`rounded-2xl p-3 text-center ${aiWinning ? 'bg-cyan-500/15 ring-2 ring-cyan-500/40' : 'bg-white/5'}`}>
          <p className="text-2xl mb-1">🤖</p>
          <p className="text-2xl font-extrabold text-cyan-400">{aiPlayer.score}</p>
          <p className="text-xs text-gray-500">{aiPlayer.correctCount}/{aiPlayer.answeredCount}</p>
        </div>
        <div className={`rounded-2xl p-3 text-center ${!aiWinning && topHumanScore > 0 ? 'bg-brand-500/15 ring-2 ring-brand-500/40' : 'bg-white/5'}`}>
          <p className="text-2xl mb-1">👥</p>
          <p className="text-2xl font-extrabold text-brand-400">{topHumanScore}</p>
          <p className="text-xs text-gray-500">Top Human</p>
        </div>
      </div>
      <p className="text-xs text-center mt-3 font-semibold">
        {humansBeatingAI === 0 && topHumanScore > 0
          ? <span className="text-cyan-400">🤖 AI leads!</span>
          : humansBeatingAI > 0
          ? <span className="text-green-400">🎉 {humansBeatingAI} human{humansBeatingAI > 1 ? 's' : ''} ahead!</span>
          : <span className="text-gray-400">Game on...</span>
        }
      </p>
    </div>
  );
}

// ── Host Dashboard ──
export default function HostDashboard() {
  const [gameState, setGameState] = useState<HostGameState | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [showAnswer, setShowAnswer] = useState(false);
  const [tab, setTab] = useState<'dashboard' | 'leaderboard'>('dashboard');
  const [windowSize, setWindowSize] = useState({ w: 1200, h: 800 });

  useEffect(() => {
    setWindowSize({ w: window.innerWidth, h: window.innerHeight });
    const handleResize = () => setWindowSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const socket = getSocket();
    socket.emit('host:join');

    socket.on('gameState', (state: HostGameState) => {
      setGameState(prev => {
        if (prev && state.currentQuestionIndex !== prev.currentQuestionIndex) {
          setShowAnswer(false);
          setShowConfetti(false);
        }
        return state;
      });
    });

    socket.on('timer', (data: { timeRemaining: number }) => {
      setGameState(prev => prev ? { ...prev, timeRemaining: data.timeRemaining } : prev);
    });

    socket.on('answerRevealed', () => {
      setShowAnswer(true);
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 5000);
    });

    return () => {
      socket.off('gameState');
      socket.off('timer');
      socket.off('answerRevealed');
    };
  }, []);

  const emit = useCallback((event: string) => {
    getSocket().emit(event);
  }, []);

  const appUrl = typeof window !== 'undefined' ? window.location.origin : '';

  const humanParticipants = gameState?.participants.filter(p => !p.isAI) || [];
  const aiPlayer = gameState?.aiPlayer || gameState?.participants.find(p => p.isAI) || null;

  // ── WAITING / LOBBY ──
  if (!gameState || gameState.status === 'waiting') {
    return (
      <div className="min-h-screen p-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center gap-4 mb-8">
            <div className="bg-white rounded-2xl shadow-lg shadow-brand-500/10 overflow-hidden flex items-center justify-center" style={{ padding: '14px 28px' }}>
              <img src="/logo.png" alt="Reliance Matrix" style={{ height: '48px', width: 'auto', display: 'block' }} />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold gradient-text">Strategic Offsite 2026</h1>
              <p className="text-sm text-cyan-400">🧠 Are You Smarter Than AI?</p>
            </div>
          </div>

          <div className="grid lg:grid-cols-3 gap-6">
            {/* QR Code */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-8 text-center">
              <h2 className="text-xl font-bold mb-4">Scan to Join</h2>
              <div className="bg-white p-4 rounded-2xl inline-block">
                <QRCodeSVG value={appUrl} size={200} level="H" />
              </div>
              <p className="text-sm text-gray-400 mt-4 break-all">{appUrl}</p>
              <div className="mt-4 px-4 py-2 rounded-xl bg-white/5 border border-white/10">
                <p className="text-xs text-gray-400">Session Code</p>
                <p className="text-2xl font-black tracking-widest text-brand-400">{gameState?.sessionCode || '...'}</p>
              </div>
            </motion.div>

            {/* Players + Round Preview */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="glass-card p-8 lg:col-span-2"
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold">Players ({humanParticipants.length} + 🤖 AI)</h2>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => emit('host:startQuiz')}
                  disabled={!gameState || humanParticipants.length === 0}
                  className="px-8 py-3 rounded-2xl gradient-bg text-white font-bold text-lg disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-brand-500/30"
                >
                  🚀 Start Quiz
                </motion.button>
              </div>

              {/* Round preview */}
              <div className="grid grid-cols-3 gap-2 mb-6">
                <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-xl p-3 text-center">
                  <p className="text-lg">🤖</p>
                  <p className="text-xs font-bold text-cyan-400">Round 1</p>
                  <p className="text-[10px] text-gray-500">The Machine Round</p>
                </div>
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-center">
                  <p className="text-lg">⚔️</p>
                  <p className="text-xs font-bold text-amber-400">Round 2</p>
                  <p className="text-[10px] text-gray-500">The Battle Round</p>
                </div>
                <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3 text-center">
                  <p className="text-lg">🧠</p>
                  <p className="text-xs font-bold text-green-400">Round 3</p>
                  <p className="text-[10px] text-gray-500">The Human Round</p>
                </div>
              </div>

              {humanParticipants.length === 0 ? (
                <div className="text-center py-8">
                  <span className="text-5xl">📱</span>
                  <p className="text-gray-400 mt-4">Waiting for players to scan and join...</p>
                  <p className="text-sm text-cyan-400 mt-2">🤖 AI is ready to compete!</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-h-72 overflow-y-auto scrollbar-hide">
                  <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="glass-card p-3 text-center border border-cyan-500/30 bg-cyan-500/5"
                  >
                    <div className="w-10 h-10 mx-auto rounded-full bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center text-lg">
                      🤖
                    </div>
                    <p className="text-sm font-medium mt-2 text-cyan-400">AI</p>
                  </motion.div>
                  {humanParticipants.map((p, i) => (
                    <motion.div
                      key={p.id}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: i * 0.05 }}
                      className="glass-card p-3 text-center"
                    >
                      <div className="w-10 h-10 mx-auto rounded-full bg-gradient-to-br from-brand-500 to-accent-orange flex items-center justify-center text-white font-bold">
                        {p.name.charAt(0).toUpperCase()}
                      </div>
                      <p className="text-sm font-medium mt-2 truncate">{p.name}</p>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          </div>
        </div>
      </div>
    );
  }

  // ── QUIZ ENDED ──
  if (gameState.status === 'ended') {
    const aiRank = gameState.leaderboard.findIndex(p => p.isAI) + 1;
    const totalPlayers = gameState.leaderboard.length;

    return (
      <div className="min-h-screen p-6">
        <ReactConfetti width={windowSize.w} height={windowSize.h} recycle={false} numberOfPieces={300} />
        <div className="max-w-4xl mx-auto pt-8">
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-8">
            <div className="inline-flex items-center justify-center bg-white rounded-2xl shadow-lg shadow-brand-500/10 mb-4" style={{ padding: '20px 40px' }}>
              <img src="/logo.png" alt="Reliance Matrix" style={{ height: '56px', width: 'auto', display: 'block' }} />
            </div>
            <h1 className="text-5xl font-extrabold gradient-text mb-2">🏆 Final Results</h1>
            <p className="text-gray-400">Are You Smarter Than AI? — Strategic Offsite 2026</p>
          </motion.div>

          {/* Final Verdict */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
            className="glass-card p-8 mb-8 text-center border border-cyan-500/20"
          >
            <h2 className="text-3xl font-bold mb-2">
              {aiPlayer && aiRank === 1
                ? <span className="text-cyan-400">🤖 AI Wins! Better luck next time, humans!</span>
                : <span className="text-green-400">🧠 Humanity Wins! You ARE smarter than AI!</span>
              }
            </h2>
            <p className="text-gray-400 text-sm mb-6">3 Rounds. 20 Questions. One winner.</p>
            <div className="grid grid-cols-2 gap-6 max-w-md mx-auto">
              <div className={`rounded-2xl p-5 ${aiRank === 1 ? 'bg-cyan-500/15 ring-2 ring-cyan-500/40' : 'bg-white/5'}`}>
                <p className="text-4xl mb-2">🤖</p>
                <p className="text-sm text-gray-400">AI</p>
                <p className="text-3xl font-extrabold text-cyan-400">{aiPlayer?.score || 0}</p>
                <p className="text-sm text-gray-500">Rank #{aiRank} of {totalPlayers}</p>
                <p className="text-xs text-gray-500">{aiPlayer?.correctCount}/{aiPlayer?.answeredCount} correct</p>
              </div>
              <div className={`rounded-2xl p-5 ${aiRank !== 1 ? 'bg-green-500/15 ring-2 ring-green-500/40' : 'bg-white/5'}`}>
                <p className="text-4xl mb-2">🧠</p>
                <p className="text-sm text-gray-400">Best Human</p>
                <p className="text-3xl font-extrabold text-green-400">
                  {humanParticipants.length > 0 ? Math.max(...humanParticipants.map(p => p.score)) : 0}
                </p>
                <p className="text-sm text-gray-500">
                  {humanParticipants.filter(p => aiPlayer && p.score > aiPlayer.score).length} beat AI
                </p>
                <p className="text-xs text-gray-500">{humanParticipants.length} players</p>
              </div>
            </div>
          </motion.div>

          {/* Podium */}
          <div className="flex items-end justify-center gap-4 mb-12">
            {gameState.leaderboard.slice(0, 3).map((_, i) => {
              const heights = ['h-48', 'h-36', 'h-28'];
              const medals = ['🥇', '🥈', '🥉'];
              const order = [1, 0, 2];
              const idx = order[i];
              const player = gameState.leaderboard[idx];
              if (!player) return null;

              return (
                <motion.div
                  key={player.name}
                  initial={{ opacity: 0, y: 50 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 + idx * 0.2, type: 'spring' }}
                  className={`glass-card p-6 text-center flex flex-col items-center justify-end ${heights[idx]} w-48 ${player.isAI ? 'border border-cyan-500/30' : ''}`}
                >
                  <span className="text-4xl mb-2">{medals[idx]}</span>
                  <p className={`text-lg font-bold truncate w-full ${player.isAI ? 'text-cyan-400' : ''}`}>{player.name}</p>
                  <p className={`text-3xl font-extrabold ${player.isAI ? 'text-cyan-400' : 'text-brand-400'}`}>{player.score}</p>
                  <p className="text-xs text-gray-400">{player.correctCount} correct</p>
                </motion.div>
              );
            })}
          </div>

          {/* Full leaderboard */}
          <div className="space-y-2">
            {gameState.leaderboard.map((p, i) => (
              <motion.div
                key={p.name}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className={`glass-card p-4 flex items-center gap-4 ${p.isAI ? 'border border-cyan-500/20 bg-cyan-500/5' : ''}`}
              >
                <span className="w-10 text-center text-lg font-bold text-gray-400">#{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className={`font-semibold truncate ${p.isAI ? 'text-cyan-400' : ''}`}>{p.name}</p>
                  <p className="text-xs text-gray-400">
                    {p.correctCount}/{p.answeredCount} correct &middot; avg {p.answeredCount > 0 ? Math.round(p.totalTime / p.answeredCount / 1000 * 10) / 10 : 0}s
                  </p>
                </div>
                <span className={`text-xl font-bold ${p.isAI ? 'text-cyan-400' : 'text-brand-400'}`}>{p.score}</span>
              </motion.div>
            ))}
          </div>

          <div className="text-center mt-8">
            <button onClick={() => emit('host:reset')} className="px-8 py-3 rounded-2xl bg-white/10 text-white font-semibold hover:bg-white/15 transition-all">
              🔄 Reset Quiz
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── ACTIVE QUIZ ──
  const q = gameState.currentQuestion;
  const stats = gameState.stats;
  const roundInfo = gameState.roundInfo;
  const currentRound = gameState.currentRound;

  return (
    <div className="min-h-screen p-4 lg:p-6">
      {showConfetti && <ReactConfetti width={windowSize.w} height={windowSize.h} recycle={false} numberOfPieces={200} />}

      <div className="max-w-7xl mx-auto space-y-4">
        {/* Top bar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-white rounded-xl shadow-md shadow-brand-500/10 overflow-hidden flex items-center justify-center" style={{ padding: '10px 20px' }}>
              <img src="/logo.png" alt="Reliance Matrix" style={{ height: '40px', width: 'auto', display: 'block' }} />
            </div>
            <div>
              <h1 className="text-lg font-bold">Are You Smarter Than AI?</h1>
              <p className="text-xs text-gray-400">Session: {gameState.sessionCode}</p>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setTab('dashboard')}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${tab === 'dashboard' ? 'bg-brand-500 text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}
            >
              Dashboard
            </button>
            <button
              onClick={() => setTab('leaderboard')}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${tab === 'leaderboard' ? 'bg-brand-500 text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}
            >
              Leaderboard
            </button>
          </div>
        </div>

        {/* Round Banner */}
        {roundInfo && <RoundBanner roundInfo={roundInfo} currentRound={currentRound} />}

        <AnimatePresence mode="wait">
          {tab === 'dashboard' ? (
            <motion.div key="dashboard" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="grid lg:grid-cols-3 gap-4">
                {/* LEFT */}
                <div className="lg:col-span-2 space-y-4">
                  {/* Question card */}
                  <div className="glass-card p-6">
                    <div className="flex items-center justify-between mb-4">
                      <span className="px-3 py-1 rounded-full bg-brand-500/20 text-brand-400 text-sm font-semibold">
                        Question {gameState.currentQuestionIndex + 1} of {gameState.totalQuestions}
                      </span>
                      <div className="flex items-center gap-2">
                        {gameState.status === 'paused' && (
                          <span className="px-3 py-1 rounded-full bg-yellow-500/20 text-yellow-400 text-sm font-semibold">
                            ⏸ Paused
                          </span>
                        )}
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${ROUND_COLORS[currentRound]?.bg} ${ROUND_COLORS[currentRound]?.text}`}>
                          R{currentRound}
                        </span>
                      </div>
                    </div>

                    {q && (
                      <>
                        <h2 className="text-2xl font-bold leading-relaxed mb-6">{q.question}</h2>
                        <div className="grid sm:grid-cols-2 gap-3">
                          {q.options.map((opt) => {
                            const letter = opt.charAt(0);
                            const isCorrect = letter === q.correct;
                            const isAIPick = showAnswer && aiPlayer?.currentAnswer === letter;
                            let cls = 'p-4 rounded-2xl border-2 text-left font-medium transition-all relative';
                            if (showAnswer) {
                              cls += isCorrect
                                ? ' bg-green-500/20 border-green-500 text-green-300'
                                : ' bg-white/5 border-white/10 text-gray-500';
                            } else {
                              cls += ' bg-white/5 border-white/10';
                            }
                            return (
                              <div key={opt} className={cls}>
                                {opt}
                                {showAnswer && isCorrect && <span className="ml-2">✅</span>}
                                {isAIPick && (
                                  <span className="absolute top-2 right-2 text-xs bg-cyan-500/20 text-cyan-400 px-2 py-0.5 rounded-full">
                                    🤖 AI
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {/* AI result */}
                        <AnimatePresence>
                          {showAnswer && stats?.aiStats && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              className="mt-4 bg-cyan-500/10 rounded-2xl p-4 border border-cyan-500/20"
                            >
                              <div className="flex items-center justify-between">
                                <p className="text-xs text-cyan-400 font-semibold uppercase tracking-wider">🤖 AI picked: {stats.aiStats.aiAnswer}</p>
                                <p className="text-xs text-gray-400">
                                  in {stats.aiStats.aiTime !== null ? `${(stats.aiStats.aiTime / 1000).toFixed(1)}s` : '-'}
                                </p>
                              </div>
                              <p className={`text-sm font-semibold mt-1 ${stats.aiStats.aiCorrect ? 'text-green-400' : 'text-red-400'}`}>
                                {stats.aiStats.aiCorrect ? '✅ AI got it right!' : '❌ AI got it wrong!'}
                              </p>
                            </motion.div>
                          )}
                        </AnimatePresence>

                        <AnimatePresence>
                          {showAnswer && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              className="mt-4 bg-brand-500/10 rounded-2xl p-5 border border-brand-500/20"
                            >
                              <p className="text-xs text-brand-400 font-semibold uppercase tracking-wider mb-2">🤖 AI Response</p>
                              <p className="text-gray-300 leading-relaxed">{q.aiResponse}</p>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </>
                    )}
                  </div>

                  {/* Controls */}
                  <div className="glass-card p-4">
                    <div className="flex flex-wrap gap-3">
                      {gameState.status === 'active' && (
                        <button onClick={() => emit('host:pause')} className="px-5 py-2.5 rounded-xl bg-yellow-500/20 text-yellow-400 font-semibold hover:bg-yellow-500/30 transition-all">
                          ⏸ Pause
                        </button>
                      )}
                      {gameState.status === 'paused' && (
                        <button onClick={() => emit('host:resume')} className="px-5 py-2.5 rounded-xl bg-green-500/20 text-green-400 font-semibold hover:bg-green-500/30 transition-all">
                          ▶ Resume
                        </button>
                      )}
                      <button onClick={() => emit('host:showAnswer')} className="px-5 py-2.5 rounded-xl bg-brand-500/20 text-brand-400 font-semibold hover:bg-brand-500/30 transition-all">
                        👁 Reveal Answer
                      </button>
                      <button onClick={() => emit('host:showLeaderboard')} className="px-5 py-2.5 rounded-xl bg-amber-500/20 text-amber-400 font-semibold hover:bg-amber-500/30 transition-all">
                        🏆 Show Leaderboard
                      </button>
                      {gameState.currentQuestionIndex < gameState.totalQuestions - 1 ? (
                        <button onClick={() => emit('host:nextQuestion')} className="px-5 py-2.5 rounded-xl gradient-bg text-white font-semibold shadow-lg shadow-brand-500/20 hover:shadow-brand-500/40 transition-all">
                          Next Question →
                        </button>
                      ) : (
                        <button onClick={() => emit('host:endQuiz')} className="px-5 py-2.5 rounded-xl bg-red-500/20 text-red-400 font-semibold hover:bg-red-500/30 transition-all">
                          🏁 End Quiz
                        </button>
                      )}
                      <button onClick={() => emit('host:reset')} className="px-5 py-2.5 rounded-xl bg-white/5 text-gray-400 font-semibold hover:bg-white/10 transition-all ml-auto">
                        🔄 Reset
                      </button>
                    </div>
                  </div>

                  {/* Stats */}
                  {stats && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <StatCard icon="👥" label="Human Players" value={stats.totalPlayers} color="brand" />
                      <StatCard icon="✅" label="Answered" value={`${stats.totalAnswered}/${stats.totalPlayers}`} color="teal" />
                      <StatCard icon="🎯" label="Correct" value={stats.correctCount} color="green" />
                      <StatCard icon="❌" label="Wrong" value={stats.wrongCount} color="red" />
                      <StatCard icon="⚡" label="Fastest Human" value={stats.fastestTime ? `${(stats.fastestTime / 1000).toFixed(1)}s` : '-'} color="orange" />
                      <StatCard icon="📊" label="Avg Time" value={stats.avgTime ? `${(stats.avgTime / 1000).toFixed(1)}s` : '-'} color="gold" />
                      <StatCard icon="🏅" label="Fastest Correct" value={stats.fastestCorrectName || '-'} color="brand" />
                      <StatCard icon="🤖" label="AI Time" value={aiPlayer?.currentTime ? `${(aiPlayer.currentTime / 1000).toFixed(1)}s` : 'Thinking...'} color="cyan" />
                    </div>
                  )}
                </div>

                {/* RIGHT */}
                <div className="space-y-4">
                  <div className="glass-card p-6 flex flex-col items-center">
                    <TimerRing time={gameState.timeRemaining} total={15} />
                    <p className="text-sm text-gray-400 mt-2">Time Remaining</p>
                  </div>

                  <AIScoreCard aiPlayer={aiPlayer} humanParticipants={humanParticipants} />

                  {/* Progress */}
                  <div className="glass-card p-4">
                    <p className="text-xs text-gray-400 mb-2">Quiz Progress</p>
                    <div className="w-full bg-white/10 rounded-full h-3">
                      <motion.div
                        className="h-3 rounded-full gradient-bg"
                        initial={{ width: 0 }}
                        animate={{ width: `${((gameState.currentQuestionIndex + 1) / gameState.totalQuestions) * 100}%` }}
                      />
                    </div>
                    <div className="flex justify-between mt-2">
                      <p className="text-xs text-gray-400">{gameState.currentQuestionIndex + 1}/{gameState.totalQuestions}</p>
                      <p className={`text-xs font-semibold ${ROUND_COLORS[currentRound]?.text}`}>Round {currentRound}/3</p>
                    </div>
                  </div>

                  {/* Live answers */}
                  <div className="glass-card p-4">
                    <h3 className="text-sm font-semibold mb-3 text-gray-300">Live Responses</h3>
                    <div className="space-y-2 max-h-64 overflow-y-auto scrollbar-hide">
                      {aiPlayer?.currentAnswer && (
                        <div className="flex items-center gap-2 text-sm bg-cyan-500/10 rounded-lg px-2 py-1.5 border border-cyan-500/20">
                          <span className="text-cyan-400 w-5">🤖</span>
                          <span className="flex-1 truncate text-cyan-400 font-medium">AI</span>
                          <span className="text-xs text-cyan-400/70">
                            {aiPlayer.currentTime ? `${(aiPlayer.currentTime / 1000).toFixed(1)}s` : ''}
                          </span>
                          {showAnswer && q && (
                            <span>{aiPlayer.currentAnswer === q.correct ? '✅' : '❌'}</span>
                          )}
                        </div>
                      )}
                      {gameState.participants
                        .filter(p => p.currentAnswer && !p.isAI)
                        .sort((a, b) => (a.currentTime || 0) - (b.currentTime || 0))
                        .map((p, i) => (
                          <div key={p.id} className="flex items-center gap-2 text-sm">
                            <span className="text-gray-500 w-5">{i + 1}.</span>
                            <span className="flex-1 truncate">{p.name}</span>
                            <span className="text-xs text-gray-500">
                              {p.currentTime ? `${(p.currentTime / 1000).toFixed(1)}s` : ''}
                            </span>
                            {showAnswer && q && (
                              <span>{p.currentAnswer === q.correct ? '✅' : '❌'}</span>
                            )}
                          </div>
                        ))}
                      {gameState.participants.filter(p => p.currentAnswer).length === 0 && (
                        <p className="text-xs text-gray-500 text-center py-4">No answers yet</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div key="leaderboard" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="max-w-2xl mx-auto space-y-3">
                <h2 className="text-2xl font-bold text-center gradient-text mb-6">🏆 Are You Smarter Than AI? — Leaderboard</h2>
                {gameState.leaderboard.map((p, i) => (
                  <motion.div
                    key={p.name}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className={`glass-card p-4 flex items-center gap-4 ${p.isAI ? 'border border-cyan-500/20 bg-cyan-500/5' : ''}`}
                  >
                    <span className="text-2xl w-12 text-center font-bold">
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className={`font-semibold truncate text-lg ${p.isAI ? 'text-cyan-400' : ''}`}>{p.name}</p>
                      <p className="text-xs text-gray-400">
                        {p.correctCount}/{p.answeredCount} correct &middot; avg {p.answeredCount > 0 ? `${(p.totalTime / p.answeredCount / 1000).toFixed(1)}s` : '-'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`text-2xl font-extrabold ${p.isAI ? 'text-cyan-400' : 'text-brand-400'}`}>{p.score}</p>
                      <p className="text-xs text-gray-500">points</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
