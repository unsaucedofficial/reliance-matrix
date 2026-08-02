import express from 'express';
import { createServer } from 'http';
import next from 'next';
import { Server as SocketIOServer } from 'socket.io';
import * as fs from 'fs';
import * as path from 'path';

const dev = process.env.NODE_ENV !== 'production';
const hostname = '0.0.0.0';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// ── Types ──────────────────────────────────────────────
interface Question {
  id: number;
  question: string;
  options: string[];
  correct: string;
  aiAnswer: string;
  aiTime: number;
  aiResponse: string;
}

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

interface GameState {
  status: 'waiting' | 'active' | 'paused' | 'showing_answer' | 'ended';
  currentQuestionIndex: number;
  questionStartTime: number | null;
  timeRemaining: number;
  participants: Map<string, Participant>;
  answers: Map<string, { answer: string; time: number }>;
  sessionCode: string;
}

// ── Load Questions ─────────────────────────────────────
const questionsPath = path.join(__dirname, 'src', 'data', 'questions.json');
const questions: Question[] = JSON.parse(fs.readFileSync(questionsPath, 'utf-8'));

// ── Constants ──────────────────────────────────────────
const QUESTION_TIME = 20;
const AI_PARTICIPANT_ID = '__AI_PLAYER__';

function generateSessionCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// ── Game State ─────────────────────────────────────────
const gameState: GameState = {
  status: 'waiting',
  currentQuestionIndex: -1,
  questionStartTime: null,
  timeRemaining: QUESTION_TIME,
  participants: new Map(),
  answers: new Map(),
  sessionCode: generateSessionCode(),
};

let timerInterval: NodeJS.Timeout | null = null;
let aiTimeout: NodeJS.Timeout | null = null;

// ── AI Participant ─────────────────────────────────────
function createAIParticipant(): Participant {
  return {
    id: AI_PARTICIPANT_ID,
    name: '🤖 AI',
    score: 0,
    totalTime: 0,
    answeredCount: 0,
    correctCount: 0,
    currentAnswer: null,
    currentTime: null,
    isAI: true,
  };
}

function ensureAIParticipant() {
  if (!gameState.participants.has(AI_PARTICIPANT_ID)) {
    gameState.participants.set(AI_PARTICIPANT_ID, createAIParticipant());
  }
}

function scheduleAIAnswer(io: SocketIOServer) {
  if (aiTimeout) clearTimeout(aiTimeout);

  const currentQ = questions[gameState.currentQuestionIndex];
  if (!currentQ) return;

  const aiTime = currentQ.aiTime;
  const aiAnswer = currentQ.aiAnswer;

  aiTimeout = setTimeout(() => {
    if (gameState.status !== 'active') return;

    const aiPlayer = gameState.participants.get(AI_PARTICIPANT_ID);
    if (!aiPlayer || aiPlayer.currentAnswer !== null) return;

    aiPlayer.currentAnswer = aiAnswer;
    aiPlayer.currentTime = aiTime;
    aiPlayer.answeredCount++;

    gameState.answers.set(AI_PARTICIPANT_ID, { answer: aiAnswer, time: aiTime });

    if (aiAnswer === currentQ.correct) {
      const timeBonus = Math.max(0, Math.round(500 * (1 - aiTime / (QUESTION_TIME * 1000))));
      aiPlayer.score += 1000 + timeBonus;
      aiPlayer.correctCount++;
    }
    aiPlayer.totalTime += aiTime;

    broadcastGameState(io);
  }, aiTime);
}

// ── Helpers ────────────────────────────────────────────
function getParticipantsList(): Participant[] {
  return Array.from(gameState.participants.values());
}

function getLeaderboard(): Participant[] {
  return getParticipantsList()
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.totalTime !== b.totalTime) return a.totalTime - b.totalTime;
      return 0;
    });
}

function getHumanParticipants(): Participant[] {
  return getParticipantsList().filter(p => !p.isAI);
}

function getQuestionStats() {
  const currentQ = questions[gameState.currentQuestionIndex];
  if (!currentQ) return null;

  const answersArr = Array.from(gameState.answers.entries());
  const humanAnswers = answersArr.filter(([id]) => id !== AI_PARTICIPANT_ID);
  const humanAnswerValues = humanAnswers.map(([, a]) => a);
  const correctAnswers = humanAnswerValues.filter(a => a.answer === currentQ.correct);
  const wrongAnswers = humanAnswerValues.filter(a => a.answer !== currentQ.correct);
  const times = humanAnswerValues.map(a => a.time);
  const fastestTime = times.length > 0 ? Math.min(...times) : 0;
  const avgTime = times.length > 0 ? times.reduce((s, t) => s + t, 0) / times.length : 0;

  let fastestCorrectName = '';
  if (correctAnswers.length > 0) {
    const fastest = correctAnswers.reduce((min, a) => a.time < min.time ? a : min, correctAnswers[0]);
    for (const [id, p] of gameState.participants) {
      if (id === AI_PARTICIPANT_ID) continue;
      if (p.currentTime === fastest.time && p.currentAnswer === fastest.answer) {
        fastestCorrectName = p.name;
        break;
      }
    }
  }

  // AI stats for this question
  const aiPlayer = gameState.participants.get(AI_PARTICIPANT_ID);
  const aiStats = aiPlayer ? {
    aiAnswer: aiPlayer.currentAnswer,
    aiTime: aiPlayer.currentTime,
    aiCorrect: aiPlayer.currentAnswer === currentQ.correct,
  } : null;

  return {
    totalAnswered: humanAnswerValues.length,
    correctCount: correctAnswers.length,
    wrongCount: wrongAnswers.length,
    fastestTime,
    avgTime: Math.round(avgTime),
    fastestCorrectName,
    totalPlayers: getHumanParticipants().length,
    aiStats,
  };
}

function broadcastGameState(io: SocketIOServer) {
  const currentQ = questions[gameState.currentQuestionIndex];
  const aiPlayer = gameState.participants.get(AI_PARTICIPANT_ID) || null;

  io.to('host').emit('gameState', {
    status: gameState.status,
    currentQuestionIndex: gameState.currentQuestionIndex,
    totalQuestions: questions.length,
    currentQuestion: currentQ || null,
    timeRemaining: gameState.timeRemaining,
    participants: getParticipantsList(),
    leaderboard: getLeaderboard(),
    stats: getQuestionStats(),
    sessionCode: gameState.sessionCode,
    aiPlayer,
  });

  io.to('participants').emit('gameState', {
    status: gameState.status,
    currentQuestionIndex: gameState.currentQuestionIndex,
    totalQuestions: questions.length,
    currentQuestion: currentQ ? {
      id: currentQ.id,
      question: currentQ.question,
      options: currentQ.options,
    } : null,
    timeRemaining: gameState.timeRemaining,
    sessionCode: gameState.sessionCode,
    leaderboard: getLeaderboard().slice(0, 10),
    totalPlayers: getHumanParticipants().length,
    aiPlayer,
  });
}

function startTimer(io: SocketIOServer) {
  if (timerInterval) clearInterval(timerInterval);
  gameState.timeRemaining = QUESTION_TIME;
  gameState.questionStartTime = Date.now();

  // Schedule AI answer
  scheduleAIAnswer(io);

  timerInterval = setInterval(() => {
    if (gameState.status === 'paused') return;
    gameState.timeRemaining--;
    io.emit('timer', { timeRemaining: gameState.timeRemaining });
    if (gameState.timeRemaining <= 0) {
      if (timerInterval) clearInterval(timerInterval);
      gameState.status = 'showing_answer';
      broadcastGameState(io);
    }
  }, 1000);
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  if (aiTimeout) {
    clearTimeout(aiTimeout);
    aiTimeout = null;
  }
}

function resetGame() {
  stopTimer();
  gameState.status = 'waiting';
  gameState.currentQuestionIndex = -1;
  gameState.questionStartTime = null;
  gameState.timeRemaining = QUESTION_TIME;
  gameState.answers.clear();
  gameState.sessionCode = generateSessionCode();
  for (const [id, p] of gameState.participants) {
    p.score = 0;
    p.totalTime = 0;
    p.answeredCount = 0;
    p.correctCount = 0;
    p.currentAnswer = null;
    p.currentTime = null;
  }
}

// ── Start Server ───────────────────────────────────────
app.prepare().then(() => {
  const expressApp = express();
  const server = createServer(expressApp);

  const io = new SocketIOServer(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
    transports: ['websocket', 'polling'],
  });

  io.on('connection', (socket) => {
    console.log(`Connected: ${socket.id}`);

    // ── Host Events ──
    socket.on('host:join', () => {
      socket.join('host');
      ensureAIParticipant();
      broadcastGameState(io);
    });

    socket.on('host:startQuiz', () => {
      ensureAIParticipant();
      gameState.status = 'active';
      gameState.currentQuestionIndex = 0;
      gameState.answers.clear();
      for (const [, p] of gameState.participants) {
        p.currentAnswer = null;
        p.currentTime = null;
      }
      startTimer(io);
      broadcastGameState(io);
    });

    socket.on('host:nextQuestion', () => {
      if (gameState.currentQuestionIndex < questions.length - 1) {
        gameState.currentQuestionIndex++;
        gameState.status = 'active';
        gameState.answers.clear();
        for (const [, p] of gameState.participants) {
          p.currentAnswer = null;
          p.currentTime = null;
        }
        startTimer(io);
        broadcastGameState(io);
      }
    });

    socket.on('host:showAnswer', () => {
      stopTimer();
      gameState.status = 'showing_answer';

      // If AI hasn't answered yet, force its answer now
      const aiPlayer = gameState.participants.get(AI_PARTICIPANT_ID);
      const currentQ = questions[gameState.currentQuestionIndex];
      if (aiPlayer && aiPlayer.currentAnswer === null && currentQ) {
        const elapsed = gameState.questionStartTime ? Date.now() - gameState.questionStartTime : currentQ.aiTime;
        aiPlayer.currentAnswer = currentQ.aiAnswer;
        aiPlayer.currentTime = Math.min(elapsed, currentQ.aiTime);
        aiPlayer.answeredCount++;
        gameState.answers.set(AI_PARTICIPANT_ID, { answer: currentQ.aiAnswer, time: aiPlayer.currentTime });
        if (currentQ.aiAnswer === currentQ.correct) {
          const timeBonus = Math.max(0, Math.round(500 * (1 - aiPlayer.currentTime / (QUESTION_TIME * 1000))));
          aiPlayer.score += 1000 + timeBonus;
          aiPlayer.correctCount++;
        }
        aiPlayer.totalTime += aiPlayer.currentTime;
      }

      io.emit('answerRevealed', {
        correct: currentQ.correct,
        aiResponse: currentQ.aiResponse,
        aiAnswer: currentQ.aiAnswer,
        aiTime: currentQ.aiTime,
        stats: getQuestionStats(),
      });
      broadcastGameState(io);
    });

    socket.on('host:showLeaderboard', () => {
      io.emit('showLeaderboard', { leaderboard: getLeaderboard() });
    });

    socket.on('host:pause', () => {
      gameState.status = 'paused';
      broadcastGameState(io);
    });

    socket.on('host:resume', () => {
      gameState.status = 'active';
      broadcastGameState(io);
    });

    socket.on('host:endQuiz', () => {
      stopTimer();
      gameState.status = 'ended';
      broadcastGameState(io);
    });

    socket.on('host:reset', () => {
      resetGame();
      broadcastGameState(io);
    });

    // ── Participant Events ──
    socket.on('participant:join', (data: { name: string }) => {
      const name = data.name.trim();
      if (!name) return;

      let displayName = name;
      let counter = 1;
      const existingNames = new Set(
        Array.from(gameState.participants.values()).map(p => p.name)
      );
      while (existingNames.has(displayName)) {
        counter++;
        displayName = `${name} (${counter})`;
      }

      const participant: Participant = {
        id: socket.id,
        name: displayName,
        score: 0,
        totalTime: 0,
        answeredCount: 0,
        correctCount: 0,
        currentAnswer: null,
        currentTime: null,
        isAI: false,
      };

      gameState.participants.set(socket.id, participant);
      socket.join('participants');
      socket.emit('joined', { name: displayName, sessionCode: gameState.sessionCode });
      broadcastGameState(io);
    });

    socket.on('participant:answer', (data: { answer: string }) => {
      const participant = gameState.participants.get(socket.id);
      if (!participant || gameState.status !== 'active') return;
      if (participant.currentAnswer !== null) return;

      const timeTaken = gameState.questionStartTime
        ? Date.now() - gameState.questionStartTime
        : 0;

      participant.currentAnswer = data.answer;
      participant.currentTime = timeTaken;
      participant.answeredCount++;

      gameState.answers.set(socket.id, { answer: data.answer, time: timeTaken });

      const currentQ = questions[gameState.currentQuestionIndex];
      if (currentQ && data.answer === currentQ.correct) {
        const timeBonus = Math.max(0, Math.round(500 * (1 - timeTaken / (QUESTION_TIME * 1000))));
        participant.score += 1000 + timeBonus;
        participant.correctCount++;
      }
      participant.totalTime += timeTaken;

      socket.emit('answerReceived', { timeTaken });
      broadcastGameState(io);
    });

    socket.on('disconnect', () => {
      // Never delete AI participant
      if (socket.id !== AI_PARTICIPANT_ID) {
        gameState.participants.delete(socket.id);
      }
      broadcastGameState(io);
      console.log(`Disconnected: ${socket.id}`);
    });
  });

  expressApp.all('*', (req: any, res: any) => handle(req, res));

  server.listen(port, hostname, () => {
    console.log(`\n🎯 Reliance Matrix Quiz Server — AI vs Humanity`);
    console.log(`   Local:    http://localhost:${port}`);
    console.log(`   Host:     http://localhost:${port}/host`);
    console.log(`   Session:  ${gameState.sessionCode}\n`);
  });
});
