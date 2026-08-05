'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { getSocket } from '@/lib/socket';
import { motion, AnimatePresence } from 'framer-motion';
import ReactConfetti from 'react-confetti';

// ── Types ──
interface RoundInfo {
  number: number;
  name: string;
  subtitle: string;
  emoji: string;
}

interface LeaderboardEntry {
  name: string;
  score: number;
  totalTime: number;
  correctCount: number;
  answeredCount: number;
  isAI?: boolean;
}

interface AIPlayer {
  name: string;
  score: number;
  correctCount: number;
  answeredCount: number;
  currentAnswer: string | null;
  currentTime: number | null;
  isAI: boolean;
}

interface GameState {
  status: string;
  currentQuestionIndex: number;
  totalQuestions: number;
  currentQuestion: {
    id: number;
    question: string;
    options: string[];
  } | null;
  timeRemaining: number;
  questionTimer: number;
  sessionCode: string;
  leaderboard: LeaderboardEntry[];
  totalPlayers: number;
  aiPlayer: AIPlayer | null;
  roundInfo: RoundInfo;
  currentRound: number;
}

interface AnswerReveal {
  correct: string;
  aiResponse: string;
  aiAnswer: string;
  aiTime: number;
}

const ROUND_COLORS: Record<number, { text: string; bg: string }> = {
  1: { text: 'text-cyan-400', bg: 'bg-cyan-500/10' },
  2: { text: 'text-amber-400', bg: 'bg-amber-500/10' },
  3: { text: 'text-green-400', bg: 'bg-green-500/10' },
};

const loadingMessages = [
  'Warming up the quiz engine...',
  'Teaching AI some humility...',
  'Calibrating fun levels...',
  'Loading the battle arena...',
  'Preparing brain vs machine...',
  'Sharpening human instincts...',
  'Counting AI mistakes in advance...',
];

function CountdownRing({ time, total }: { time: number; total: number }) {
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const progress = (time / total) * circumference;
  const isUrgent = time <= 5;

  return (
    <div className="relative w-24 h-24 mx-auto">
      <svg className="countdown-ring w-24 h-24" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={radius} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="6" />
        <circle
          cx="50" cy="50" r={radius} fill="none"
          stroke={isUrgent ? '#ef4444' : '#6366f1'}
          strokeWidth="6" strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - progress}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={`text-3xl font-bold ${isUrgent ? 'text-red-400' : 'text-white'}`}>
          {time}
        </span>
      </div>
    </div>
  );
}

export default function ParticipantPage() {
  const [joined, setJoined] = useState(false);
  const [name, setName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [answerSubmitted, setAnswerSubmitted] = useState(false);
  const [answerReveal, setAnswerReveal] = useState<AnswerReveal | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [showWrongAnim, setShowWrongAnim] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [loadingMsg] = useState(() => loadingMessages[Math.floor(Math.random() * loadingMessages.length)]);
  const [windowSize, setWindowSize] = useState({ w: 400, h: 800 });
  const [roundComplete, setRoundComplete] = useState<{
    completedRound: RoundInfo;
    leaderboard: LeaderboardEntry[];
    nextRound: RoundInfo;
  } | null>(null);
  const prevQuestionRef = useRef(-1);

  useEffect(() => {
    setWindowSize({ w: window.innerWidth, h: window.innerHeight });
  }, []);

  useEffect(() => {
    const socket = getSocket();

    socket.on('joined', (data: { name: string }) => {
      setDisplayName(data.name);
      setJoined(true);
    });

    socket.on('gameState', (state: GameState) => {
      setGameState(state);
      if (state.currentQuestionIndex !== prevQuestionRef.current) {
        setSelectedAnswer(null);
        setAnswerSubmitted(false);
        setAnswerReveal(null);
        setShowConfetti(false);
        setShowWrongAnim(false);
        setShowLeaderboard(false);
        setRoundComplete(null);
        prevQuestionRef.current = state.currentQuestionIndex;
      }
    });

    socket.on('timer', (data: { timeRemaining: number }) => {
      setGameState(prev => prev ? { ...prev, timeRemaining: data.timeRemaining } : prev);
    });

    socket.on('answerRevealed', (data: AnswerReveal) => {
      setAnswerReveal(data);
      if (selectedAnswer === data.correct) {
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 4000);
      } else if (selectedAnswer && selectedAnswer !== data.correct) {
        setShowWrongAnim(true);
        setTimeout(() => setShowWrongAnim(false), 1000);
      }
    });

    socket.on('showLeaderboard', () => {
      setShowLeaderboard(true);
    });

    socket.on('roundComplete', (data: { completedRound: RoundInfo; leaderboard: LeaderboardEntry[]; nextRound: RoundInfo }) => {
      setRoundComplete(data);
    });

    return () => {
      socket.off('joined');
      socket.off('gameState');
      socket.off('timer');
      socket.off('answerRevealed');
      socket.off('showLeaderboard');
      socket.off('roundComplete');
    };
  }, [selectedAnswer]);

  const handleJoin = useCallback(() => {
    if (!name.trim()) return;
    const socket = getSocket();
    socket.emit('participant:join', { name: name.trim() });
  }, [name]);

  const handleAnswer = useCallback((option: string) => {
    if (answerSubmitted) return;
    const letter = option.charAt(0);
    setSelectedAnswer(letter);
    setAnswerSubmitted(true);
    const socket = getSocket();
    socket.emit('participant:answer', { answer: letter });
  }, [answerSubmitted]);

  const getOptionClass = (option: string) => {
    const letter = option.charAt(0);
    let cls = 'option-btn';
    if (answerReveal) {
      if (letter === answerReveal.correct) cls += ' correct';
      else if (letter === selectedAnswer) cls += ' wrong';
    } else if (letter === selectedAnswer) {
      cls += ' selected';
    }
    return cls;
  };

  // ── JOIN SCREEN ──
  if (!joined) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card p-8 w-full max-w-md text-center"
        >
          <div className="mb-6">
            <div className="bg-white rounded-2xl px-8 py-4 inline-block shadow-lg shadow-brand-500/10">
              <img src="/logo.png" alt="Reliance Matrix" className="h-16 w-auto object-contain" />
            </div>
          </div>
          <h1 className="text-2xl font-extrabold gradient-text mb-1">Strategic Offsite 2026</h1>
          <p className="text-sm text-cyan-400 mb-8">🧠 Are You Smarter Than AI?</p>

          <div className="space-y-4">
            <input
              type="text"
              placeholder="Enter Your Name"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleJoin()}
              className="w-full px-5 py-4 rounded-2xl bg-white/5 border border-white/10 text-white text-lg placeholder-gray-500 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 transition-all"
              autoFocus
              maxLength={30}
            />
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleJoin}
              disabled={!name.trim()}
              className="w-full py-4 rounded-2xl gradient-bg text-white font-bold text-lg disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg shadow-brand-500/30"
            >
              Challenge the AI
            </motion.button>
          </div>

          <p className="text-xs text-gray-500 mt-6">No account needed — just your name!</p>
        </motion.div>
      </div>
    );
  }

  // ── WAITING SCREEN ──
  if (!gameState || gameState.status === 'waiting') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="glass-card p-8 w-full max-w-md text-center"
        >
          <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-gradient-to-br from-brand-500 to-accent-pink flex items-center justify-center">
            <span className="text-2xl">🧠</span>
          </div>
          <h2 className="text-2xl font-bold mb-2">Welcome, {displayName}!</h2>
          <p className="text-gray-400 mb-4">{loadingMsg}</p>

          {/* Round preview */}
          <div className="grid grid-cols-3 gap-2 mb-6">
            <div className="bg-cyan-500/10 rounded-xl p-2 text-center">
              <p className="text-sm">🤖</p>
              <p className="text-[10px] text-cyan-400 font-bold">R1: Battle of Logic</p>
            </div>
            <div className="bg-amber-500/10 rounded-xl p-2 text-center">
              <p className="text-sm">⚔️</p>
              <p className="text-[10px] text-amber-400 font-bold">R2: Battle of Wits</p>
            </div>
            <div className="bg-green-500/10 rounded-xl p-2 text-center">
              <p className="text-sm">🧠</p>
              <p className="text-[10px] text-green-400 font-bold">R3: Battle of Instinct</p>
            </div>
          </div>

          <div className="flex items-center justify-center gap-2">
            <div className="w-2 h-2 rounded-full bg-brand-500 animate-bounce" style={{ animationDelay: '0ms' }} />
            <div className="w-2 h-2 rounded-full bg-accent-pink animate-bounce" style={{ animationDelay: '150ms' }} />
            <div className="w-2 h-2 rounded-full bg-accent-orange animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
          <p className="text-sm text-gray-500 mt-4">Waiting for the host to start...</p>
          {gameState && (
            <p className="text-xs text-gray-600 mt-2">{gameState.totalPlayers} human{gameState.totalPlayers !== 1 ? 's' : ''} + 🤖 AI ready</p>
          )}
        </motion.div>
      </div>
    );
  }

  // ── ROUND COMPLETE ──
  if (gameState.status === 'round_complete' && roundComplete) {
    const { completedRound, leaderboard, nextRound } = roundComplete;
    const rc = ROUND_COLORS[completedRound.number] || ROUND_COLORS[1];
    const myRankRC = leaderboard.findIndex(p => p.name === displayName) + 1;
    const meRC = leaderboard.find(p => p.name === displayName);
    const aiRC = leaderboard.find(p => p.isAI);
    const iBeatingAIRC = aiRC && meRC ? meRC.score > aiRC.score : false;

    return (
      <div className="min-h-screen p-4 pb-20">
        {myRankRC <= 3 && <ReactConfetti width={windowSize.w} height={windowSize.h} recycle={false} numberOfPieces={150} />}
        <div className="max-w-md mx-auto pt-8 space-y-5">
          {/* Round Complete Header */}
          <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} className="text-center">
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', delay: 0.2 }}
              className="text-6xl inline-block mb-3"
            >
              {completedRound.emoji}
            </motion.span>
            <h1 className={`text-3xl font-extrabold mb-1 ${rc.text}`}>
              {completedRound.name} Complete!
            </h1>
            <p className="text-gray-400 text-sm">{completedRound.subtitle}</p>
          </motion.div>

          {/* Your Score vs AI */}
          {meRC && aiRC && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="glass-card p-5 border border-cyan-500/20"
            >
              <p className="text-center text-lg font-bold mb-3">
                {iBeatingAIRC
                  ? <span className="text-green-400">You&apos;re beating AI! 🎉</span>
                  : <span className="text-cyan-400">AI is ahead... for now 🤖</span>
                }
              </p>
              <div className="grid grid-cols-2 gap-4 text-center">
                <div className="rounded-xl p-3 bg-brand-500/10">
                  <p className="text-xs text-gray-400">You</p>
                  <p className="text-2xl font-extrabold text-brand-400">{meRC.score}</p>
                  <p className="text-xs text-gray-500">#{myRankRC}</p>
                </div>
                <div className="rounded-xl p-3 bg-cyan-500/10">
                  <p className="text-xs text-gray-400">🤖 AI</p>
                  <p className="text-2xl font-extrabold text-cyan-400">{aiRC.score}</p>
                  <p className="text-xs text-gray-500">{aiRC.correctCount} correct</p>
                </div>
              </div>
            </motion.div>
          )}

          {/* Leaderboard */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="glass-card p-4"
          >
            <h2 className="text-lg font-bold mb-3 text-center">Standings after Round {completedRound.number}</h2>
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {leaderboard.slice(0, 10).map((p, i) => {
                const isMe = p.name === displayName;
                return (
                  <motion.div
                    key={p.name}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.5 + i * 0.05 }}
                    className={`flex items-center gap-3 p-3 rounded-xl ${
                      isMe ? 'bg-brand-500/15 ring-1 ring-brand-500/30' :
                      p.isAI ? 'bg-cyan-500/10 border border-cyan-500/20' : 'bg-white/5'
                    }`}
                  >
                    <span className="w-7 text-center text-sm font-bold text-gray-400">
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className={`font-semibold truncate text-sm ${p.isAI ? 'text-cyan-400' : isMe ? 'text-brand-400' : ''}`}>
                        {p.isAI ? '🤖 ' : ''}{p.name}{isMe ? ' (You)' : ''}
                      </p>
                    </div>
                    <span className={`text-lg font-bold ${p.isAI ? 'text-cyan-400' : 'text-brand-400'}`}>
                      {p.score}
                    </span>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>

          {/* Next Round Preview */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8 }}
            className="text-center"
          >
            <p className="text-gray-400 text-sm mb-2">Up Next</p>
            <div className={`inline-flex items-center gap-2 px-5 py-3 rounded-2xl ${ROUND_COLORS[nextRound.number]?.bg || 'bg-white/5'}`}>
              <span className="text-2xl">{nextRound.emoji}</span>
              <div className="text-left">
                <p className={`font-bold text-sm ${ROUND_COLORS[nextRound.number]?.text || 'text-white'}`}>{nextRound.name}</p>
                <p className="text-xs text-gray-400">{nextRound.subtitle}</p>
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-3">Waiting for host to start next round...</p>
          </motion.div>
        </div>
      </div>
    );
  }

  // ── QUIZ ENDED ──
  if (gameState.status === 'ended' || showLeaderboard) {
    const myRank = gameState.leaderboard.findIndex(p => p.name === displayName) + 1;
    const me = gameState.leaderboard.find(p => p.name === displayName);
    const ai = gameState.leaderboard.find(p => p.isAI);
    const aiRank = gameState.leaderboard.findIndex(p => p.isAI) + 1;
    const medal = myRank === 1 ? '🥇' : myRank === 2 ? '🥈' : myRank === 3 ? '🥉' : '';
    const iBeatingAI = ai && me ? me.score > ai.score : false;

    return (
      <div className="min-h-screen p-4 pb-20">
        {myRank <= 3 && <ReactConfetti width={windowSize.w} height={windowSize.h} recycle={false} numberOfPieces={200} />}
        <div className="max-w-md mx-auto pt-8 space-y-6">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center">
            <h1 className="text-3xl font-extrabold gradient-text mb-2">
              {gameState.status === 'ended' ? 'Quiz Complete!' : 'Leaderboard'}
            </h1>

            {me && ai && gameState.status === 'ended' && (
              <div className="glass-card p-5 mt-4 border border-cyan-500/20">
                <p className="text-lg font-bold mb-3">
                  {iBeatingAI
                    ? <span className="text-green-400">🧠 YES! You're smarter than AI!</span>
                    : <span className="text-cyan-400">🤖 AI wins this time...</span>
                  }
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white/5 rounded-xl p-3 text-center">
                    <p className="text-xs text-gray-400">You</p>
                    <p className="text-2xl font-extrabold text-brand-400">{me.score}</p>
                    <p className="text-xs text-gray-500">#{myRank}</p>
                  </div>
                  <div className="bg-cyan-500/10 rounded-xl p-3 text-center">
                    <p className="text-xs text-cyan-400">🤖 AI</p>
                    <p className="text-2xl font-extrabold text-cyan-400">{ai.score}</p>
                    <p className="text-xs text-gray-500">#{aiRank}</p>
                  </div>
                </div>
              </div>
            )}

            {me && !ai && (
              <div className="glass-card p-6 mt-4">
                <p className="text-5xl mb-2">{medal || '🎯'}</p>
                <p className="text-xl font-bold">#{myRank} — {displayName}</p>
                <p className="text-3xl font-extrabold text-brand-400 mt-1">{me.score} pts</p>
                <p className="text-sm text-gray-400 mt-1">{me.correctCount}/{me.answeredCount} correct</p>
              </div>
            )}
          </motion.div>

          <div className="space-y-2">
            {gameState.leaderboard.slice(0, 10).map((p, i) => (
              <motion.div
                key={p.name}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.08 }}
                className={`glass-card p-4 flex items-center gap-4 ${
                  p.name === displayName ? 'ring-2 ring-brand-500' : ''
                } ${p.isAI ? 'border border-cyan-500/20 bg-cyan-500/5' : ''}`}
              >
                <span className="text-2xl w-10 text-center font-bold">
                  {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                </span>
                <div className="flex-1 min-w-0">
                  <p className={`font-semibold truncate ${p.isAI ? 'text-cyan-400' : ''}`}>{p.name}</p>
                  <p className="text-xs text-gray-400">{p.correctCount}/{p.answeredCount} correct</p>
                </div>
                <span className={`text-xl font-bold ${p.isAI ? 'text-cyan-400' : 'text-brand-400'}`}>{p.score}</span>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── ACTIVE / PAUSED / SHOWING_ANSWER ──
  const q = gameState.currentQuestion;
  const roundInfo = gameState.roundInfo;
  const currentRound = gameState.currentRound;
  const roundColor = ROUND_COLORS[currentRound] || ROUND_COLORS[1];

  return (
    <div className="min-h-screen p-4 pb-20">
      {showConfetti && <ReactConfetti width={windowSize.w} height={windowSize.h} recycle={false} numberOfPieces={150} />}

      <div className="max-w-lg mx-auto pt-4 space-y-4">
        {/* Round + question indicator */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-400 font-medium">
            Q{gameState.currentQuestionIndex + 1}/{gameState.totalQuestions}
          </span>
          <span className={`text-xs font-bold px-3 py-1 rounded-full ${roundColor.bg} ${roundColor.text}`}>
            {roundInfo?.emoji} R{currentRound}: {roundInfo?.name}
          </span>
        </div>

        {gameState.status === 'active' && !answerSubmitted && (
          <CountdownRing time={gameState.timeRemaining} total={gameState.questionTimer || 15} />
        )}

        {gameState.status === 'paused' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-card p-6 text-center">
            <span className="text-4xl">⏸️</span>
            <p className="text-xl font-bold mt-2">Quiz Paused</p>
          </motion.div>
        )}

        {q && gameState.status !== 'paused' && (
          <motion.div
            key={q.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-card p-6"
          >
            <h2 className="text-xl font-bold leading-relaxed mb-6">{q.question}</h2>
            <div className={`space-y-3 ${showWrongAnim ? 'shake' : ''}`}>
              {q.options.map((opt) => (
                <motion.button
                  key={opt}
                  whileTap={!answerSubmitted ? { scale: 0.97 } : {}}
                  onClick={() => handleAnswer(opt)}
                  disabled={answerSubmitted}
                  className={`${getOptionClass(opt)} relative`}
                >
                  {opt}
                  {answerReveal && opt.charAt(0) === answerReveal.aiAnswer && (
                    <span className="absolute top-2 right-2 text-xs bg-cyan-500/20 text-cyan-400 px-2 py-0.5 rounded-full">
                      🤖
                    </span>
                  )}
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}

        <AnimatePresence>
          {answerSubmitted && !answerReveal && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="glass-card p-6 text-center"
            >
              <span className="text-4xl">✅</span>
              <p className="text-lg font-semibold mt-2">Answer Locked In!</p>
              <p className="text-gray-400 text-sm mt-1">Waiting for the reveal...</p>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {answerReveal && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass-card p-6 space-y-4"
            >
              <div className="text-center">
                {selectedAnswer === answerReveal.correct ? (
                  <>
                    <span className="text-5xl">🎉</span>
                    <p className="text-2xl font-bold text-green-400 mt-2">Correct!</p>
                  </>
                ) : selectedAnswer ? (
                  <>
                    <span className="text-5xl">😅</span>
                    <p className="text-2xl font-bold text-red-400 mt-2">Think Again!</p>
                  </>
                ) : (
                  <>
                    <span className="text-5xl">⏰</span>
                    <p className="text-2xl font-bold text-yellow-400 mt-2">Time's Up!</p>
                  </>
                )}
              </div>

              {/* AI's pick */}
              <div className="bg-cyan-500/10 rounded-xl p-3 border border-cyan-500/20">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-cyan-400 font-semibold">🤖 AI picked: {answerReveal.aiAnswer}</span>
                  <span className="text-xs text-gray-400">{(answerReveal.aiTime / 1000).toFixed(1)}s</span>
                </div>
                <p className={`text-xs font-semibold mt-1 ${answerReveal.aiAnswer === answerReveal.correct ? 'text-green-400' : 'text-red-400'}`}>
                  {answerReveal.aiAnswer === answerReveal.correct ? '✅ AI got it right' : '❌ AI got it wrong!'}
                </p>
              </div>

              <div className="bg-white/5 rounded-xl p-4">
                <p className="text-xs text-brand-400 font-semibold uppercase tracking-wider mb-2">🤖 AI Says</p>
                <p className="text-sm text-gray-300 leading-relaxed">{answerReveal.aiResponse}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
