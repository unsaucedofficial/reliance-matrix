'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { getSocket } from '@/lib/socket';
import { motion, AnimatePresence } from 'framer-motion';
import ReactConfetti from 'react-confetti';

// ── Types ──
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
  sessionCode: string;
  leaderboard: Array<{
    name: string;
    score: number;
    totalTime: number;
    correctCount: number;
    answeredCount: number;
  }>;
  totalPlayers: number;
}

interface AnswerReveal {
  correct: string;
  aiResponse: string;
}

// ── Funny loading messages ──
const loadingMessages = [
  'Warming up the quiz engine...',
  'Sharpening pencils digitally...',
  'Bribing the leaderboard...',
  'Calibrating fun levels...',
  'Loading corporate humor...',
  'Preparing brain teasers...',
  'Counting coffee cups...',
];

// ── Countdown Component ──
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

// ── Main Page ──
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
      // Reset answer state when new question arrives
      if (state.currentQuestionIndex !== prevQuestionRef.current) {
        setSelectedAnswer(null);
        setAnswerSubmitted(false);
        setAnswerReveal(null);
        setShowConfetti(false);
        setShowWrongAnim(false);
        setShowLeaderboard(false);
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

    return () => {
      socket.off('joined');
      socket.off('gameState');
      socket.off('timer');
      socket.off('answerRevealed');
      socket.off('showLeaderboard');
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
          {/* Logo placeholder */}
          <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-brand-500 to-accent-pink flex items-center justify-center">
            <span className="text-3xl font-black text-white">RM</span>
          </div>
          <h1 className="text-3xl font-extrabold gradient-text mb-1">Reliance Matrix</h1>
          <p className="text-sm text-gray-400 mb-8">Team Offsite Quiz</p>

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
              Join Quiz
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
            <span className="text-2xl">🎯</span>
          </div>
          <h2 className="text-2xl font-bold mb-2">Welcome, {displayName}!</h2>
          <p className="text-gray-400 mb-6">{loadingMsg}</p>
          <div className="flex items-center justify-center gap-2">
            <div className="w-2 h-2 rounded-full bg-brand-500 animate-bounce" style={{ animationDelay: '0ms' }} />
            <div className="w-2 h-2 rounded-full bg-accent-pink animate-bounce" style={{ animationDelay: '150ms' }} />
            <div className="w-2 h-2 rounded-full bg-accent-orange animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
          <p className="text-sm text-gray-500 mt-6">Waiting for the host to start...</p>
          {gameState && (
            <p className="text-xs text-gray-600 mt-2">{gameState.totalPlayers} player{gameState.totalPlayers !== 1 ? 's' : ''} connected</p>
          )}
        </motion.div>
      </div>
    );
  }

  // ── QUIZ ENDED ──
  if (gameState.status === 'ended' || showLeaderboard) {
    const myRank = gameState.leaderboard.findIndex(p => p.name === displayName) + 1;
    const me = gameState.leaderboard.find(p => p.name === displayName);
    const medal = myRank === 1 ? '🥇' : myRank === 2 ? '🥈' : myRank === 3 ? '🥉' : '';

    return (
      <div className="min-h-screen p-4 pb-20">
        {myRank <= 3 && <ReactConfetti width={windowSize.w} height={windowSize.h} recycle={false} numberOfPieces={200} />}
        <div className="max-w-md mx-auto pt-8 space-y-6">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center">
            <h1 className="text-3xl font-extrabold gradient-text mb-2">
              {gameState.status === 'ended' ? 'Quiz Complete!' : 'Leaderboard'}
            </h1>
            {me && (
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
                className={`glass-card p-4 flex items-center gap-4 ${p.name === displayName ? 'ring-2 ring-brand-500' : ''}`}
              >
                <span className="text-2xl w-10 text-center font-bold">
                  {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{p.name}</p>
                  <p className="text-xs text-gray-400">{p.correctCount}/{p.answeredCount} correct</p>
                </div>
                <span className="text-xl font-bold text-brand-400">{p.score}</span>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── ACTIVE / PAUSED / SHOWING_ANSWER ──
  const q = gameState.currentQuestion;

  return (
    <div className="min-h-screen p-4 pb-20">
      {showConfetti && <ReactConfetti width={windowSize.w} height={windowSize.h} recycle={false} numberOfPieces={150} />}

      <div className="max-w-lg mx-auto pt-4 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-400 font-medium">
            Q{gameState.currentQuestionIndex + 1}/{gameState.totalQuestions}
          </span>
          <span className="text-sm text-gray-400">{displayName}</span>
        </div>

        {/* Timer */}
        {gameState.status === 'active' && !answerSubmitted && (
          <CountdownRing time={gameState.timeRemaining} total={20} />
        )}

        {/* Paused */}
        {gameState.status === 'paused' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-card p-6 text-center">
            <span className="text-4xl">⏸️</span>
            <p className="text-xl font-bold mt-2">Quiz Paused</p>
          </motion.div>
        )}

        {/* Question */}
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
                  className={getOptionClass(opt)}
                >
                  {opt}
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}

        {/* Submitted feedback */}
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

        {/* Answer reveal */}
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

              <div className="bg-white/5 rounded-xl p-4 mt-4">
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
