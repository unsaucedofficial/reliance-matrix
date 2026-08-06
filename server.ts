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
  round: number;
  question: string;
  options: string[];
  correct: string;
  aiAnswer: string;
  aiTime: number;
  aiResponse: string;
  timer: number;
  aiConfidence: string;
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
  answeredQuestions: Set<number>;  // track which questions this participant answered
}

interface GameState {
  status: 'waiting' | 'active' | 'paused' | 'showing_answer' | 'round_complete' | 'ended';
  currentQuestionIndex: number;
  questionStartTime: number | null;
  timeRemaining: number;
  participants: Map<string, Participant>;
  answers: Map<string, { answer: string; time: number }>;
  sessionCode: string;
}

// ── Round definitions ─────────────────────────────────
const ROUNDS = [
  { number: 1, name: 'Battle of Logic', subtitle: 'Logic', emoji: '🤖' },
  { number: 2, name: 'Battle of Wits', subtitle: 'Knowledge', emoji: '⚔️' },
  { number: 3, name: 'Battle of Instinct', subtitle: 'Judgment', emoji: '🧠' },
];

function getRoundInfo(questionIndex: number, questions: Question[]) {
  const q = questions[questionIndex];
  if (!q) return ROUNDS[0];
  return ROUNDS.find(r => r.number === q.round) || ROUNDS[0];
}

// ── Load Questions ─────────────────────────────────────
const questionsPath = path.join(__dirname, 'src', 'data', 'questions.json');
const questions: Question[] = JSON.parse(fs.readFileSync(questionsPath, 'utf-8'));

// ── Constants ──────────────────────────────────────────
const DEFAULT_QUESTION_TIME = 15;
const AI_PARTICIPANT_ID = '__AI_PLAYER__';
const HOST_PASSWORD = 'familystore@121';

function getQuestionTime(questionIndex: number): number {
  const q = questions[questionIndex];
  return q?.timer || DEFAULT_QUESTION_TIME;
}

function generateSessionCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// ── Game State ─────────────────────────────────────────
const gameState: GameState = {
  status: 'waiting',
  currentQuestionIndex: -1,
  questionStartTime: null,
  timeRemaining: DEFAULT_QUESTION_TIME,
  participants: new Map(),
  answers: new Map(),
  sessionCode: generateSessionCode(),
};

let timerInterval: NodeJS.Timeout | null = null;
let aiTimeout: NodeJS.Timeout | null = null;
let broadcastPending: NodeJS.Timeout | null = null;

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
    answeredQuestions: new Set(),
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

  const AI_ANSWER_TIME = 1000; // AI always answers in 1 second
  const aiAnswer = currentQ.aiAnswer;

  aiTimeout = setTimeout(() => {
    if (gameState.status !== 'active') return;

    const aiPlayer = gameState.participants.get(AI_PARTICIPANT_ID);
    if (!aiPlayer || aiPlayer.currentAnswer !== null) return;

    aiPlayer.currentAnswer = aiAnswer;
    aiPlayer.currentTime = AI_ANSWER_TIME;
    aiPlayer.answeredCount++;

    gameState.answers.set(AI_PARTICIPANT_ID, { answer: aiAnswer, time: AI_ANSWER_TIME });

    if (aiAnswer === currentQ.correct) {
      aiPlayer.score += 1000;
      aiPlayer.correctCount++;
    }
    aiPlayer.totalTime += AI_ANSWER_TIME;

    broadcastGameState(io);
  }, AI_ANSWER_TIME);
}

// ── Helpers ────────────────────────────────────────────
function getParticipantsList() {
  return Array.from(gameState.participants.values()).map(p => ({
    id: p.id,
    name: p.name,
    score: p.score,
    totalTime: p.totalTime,
    answeredCount: p.answeredCount,
    correctCount: p.correctCount,
    currentAnswer: p.currentAnswer,
    currentTime: p.currentTime,
    isAI: p.isAI,
  }));
}

function getLeaderboard(): Participant[] {
  return getParticipantsList()
    .sort((a, b) => b.score - a.score);
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
  const roundInfo = gameState.currentQuestionIndex >= 0
    ? getRoundInfo(gameState.currentQuestionIndex, questions)
    : ROUNDS[0];

  // Check if this is the first question of a new round
  const prevQ = gameState.currentQuestionIndex > 0 ? questions[gameState.currentQuestionIndex - 1] : null;
  const isNewRound = currentQ && (!prevQ || prevQ.round !== currentQ.round);

  const questionTimer = getQuestionTime(gameState.currentQuestionIndex);

  io.to('host').emit('gameState', {
    status: gameState.status,
    currentQuestionIndex: gameState.currentQuestionIndex,
    totalQuestions: questions.length,
    currentQuestion: currentQ || null,
    timeRemaining: gameState.timeRemaining,
    questionTimer,
    participants: getParticipantsList(),
    leaderboard: getLeaderboard(),
    stats: getQuestionStats(),
    sessionCode: gameState.sessionCode,
    aiPlayer,
    roundInfo,
    isNewRound,
    currentRound: currentQ?.round || 1,
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
    questionTimer,
    sessionCode: gameState.sessionCode,
    leaderboard: getLeaderboard().slice(0, 10),
    totalPlayers: getHumanParticipants().length,
    aiPlayer,
    roundInfo,
    isNewRound,
    currentRound: currentQ?.round || 1,
  });
}

// Throttled version — coalesces rapid-fire broadcasts (e.g. 200 answers arriving at once)
function broadcastGameStateThrottled(io: SocketIOServer) {
  if (broadcastPending) return; // already scheduled
  broadcastPending = setTimeout(() => {
    broadcastPending = null;
    broadcastGameState(io);
  }, 300);
}

function startTimer(io: SocketIOServer) {
  if (timerInterval) clearInterval(timerInterval);
  gameState.timeRemaining = getQuestionTime(gameState.currentQuestionIndex);
  gameState.questionStartTime = Date.now();

  scheduleAIAnswer(io);

  // Broadcast timer to ALL connected sockets (host + participants + unjoined)
  timerInterval = setInterval(() => {
    if (gameState.status === 'paused') return;
    gameState.timeRemaining--;
    const timerData = {
      timeRemaining: gameState.timeRemaining,
      questionTimer: getQuestionTime(gameState.currentQuestionIndex),
      serverTime: Date.now(),
    };
    io.emit('timer', timerData);
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
  gameState.timeRemaining = DEFAULT_QUESTION_TIME;
  gameState.answers.clear();
  gameState.sessionCode = generateSessionCode();
  // Remove ALL participants including AI — fresh start
  gameState.participants.clear();
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
    socket.on('host:join', (data: { password?: string }) => {
      if (!data?.password || data.password !== HOST_PASSWORD) {
        socket.emit('host:authFailed');
        return;
      }
      socket.join('host');
      ensureAIParticipant();
      socket.emit('host:authSuccess');
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
        const currentQ = questions[gameState.currentQuestionIndex];
        const nextQ = questions[gameState.currentQuestionIndex + 1];

        // If next question is in a different round, show round complete screen
        if (currentQ && nextQ && currentQ.round !== nextQ.round) {
          gameState.status = 'round_complete';
          const completedRound = ROUNDS.find(r => r.number === currentQ.round) || ROUNDS[0];
          io.emit('roundComplete', {
            completedRound,
            leaderboard: getLeaderboard(),
            nextRound: ROUNDS.find(r => r.number === nextQ.round) || ROUNDS[1],
          });
          broadcastGameState(io);
          return;
        }

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

    socket.on('host:startNextRound', () => {
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

      const aiPlayer = gameState.participants.get(AI_PARTICIPANT_ID);
      const currentQ = questions[gameState.currentQuestionIndex];
      if (aiPlayer && aiPlayer.currentAnswer === null && currentQ) {
        const AI_ANSWER_TIME = 1000;
        aiPlayer.currentAnswer = currentQ.aiAnswer;
        aiPlayer.currentTime = AI_ANSWER_TIME;
        aiPlayer.answeredCount++;
        gameState.answers.set(AI_PARTICIPANT_ID, { answer: currentQ.aiAnswer, time: AI_ANSWER_TIME });
        if (currentQ.aiAnswer === currentQ.correct) {
          aiPlayer.score += 1000;
          aiPlayer.correctCount++;
        }
        aiPlayer.totalTime += AI_ANSWER_TIME;
      }

      io.emit('answerRevealed', {
        correct: currentQ.correct,
        aiResponse: currentQ.aiResponse,
        aiAnswer: currentQ.aiAnswer,
        aiTime: currentQ.aiTime,
        aiConfidence: currentQ.aiConfidence,
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
      // Tell all participants to reset their UI back to join screen
      io.to('participants').emit('forceReset');
      // Remove all sockets from 'participants' room
      io.in('participants').socketsLeave('participants');
      ensureAIParticipant();
      broadcastGameState(io);
    });

    // ── Participant Events ──
    socket.on('participant:join', (data: { name: string }) => {
      const name = data.name.trim();
      if (!name) return;

      // If game is active, check if this is a reconnecting participant (same name)
      if (gameState.status !== 'waiting') {
        let existingEntry: [string, Participant] | undefined;
        for (const [id, p] of gameState.participants) {
          if (p.name === name && !p.isAI) {
            existingEntry = [id, p];
            break;
          }
        }
        if (existingEntry) {
          const [oldId, oldParticipant] = existingEntry;
          // Move participant to new socket id, preserving score
          gameState.participants.delete(oldId);
          oldParticipant.id = socket.id;
          gameState.participants.set(socket.id, oldParticipant);
          socket.join('participants');
          socket.emit('joined', { name: oldParticipant.name, sessionCode: gameState.sessionCode });
          broadcastGameState(io);
          return;
        }
      }

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
        answeredQuestions: new Set(),
      };

      gameState.participants.set(socket.id, participant);
      socket.join('participants');
      socket.emit('joined', { name: displayName, sessionCode: gameState.sessionCode });
      broadcastGameState(io);
    });

    socket.on('participant:answer', (data: { answer: string; questionIndex?: number }, ackFn?: (res: any) => void) => {
      const participant = gameState.participants.get(socket.id);
      const ack = (res: any) => {
        if (typeof ackFn === 'function') ackFn(res);
        socket.emit('answerReceived', res);  // belt-and-suspenders: emit AND ack
      };

      if (!participant) {
        console.log(`[ANSWER DROPPED] socket=${socket.id} — no participant entry found. Status=${gameState.status}`);
        ack({ error: 'not_joined' });
        return;
      }

      // Determine which question this answer is for
      const answerQuestionIndex = (typeof data.questionIndex === 'number' && data.questionIndex >= 0)
        ? data.questionIndex
        : gameState.currentQuestionIndex;

      // DEFINITIVE duplicate check: has this participant already answered THIS question?
      if (participant.answeredQuestions.has(answerQuestionIndex)) {
        ack({ timeTaken: participant.currentTime || 0, duplicate: true });
        return;
      }

      if (gameState.status !== 'active' && gameState.status !== 'showing_answer') {
        console.log(`[ANSWER DROPPED] ${participant.name} — wrong status: ${gameState.status}`);
        ack({ error: 'wrong_status' });
        return;
      }

      const isLateAnswer = answerQuestionIndex !== gameState.currentQuestionIndex;
      const targetQ = questions[answerQuestionIndex];

      if (isLateAnswer) {
        console.log(`[ANSWER LATE] ${participant.name}: answered Q${answerQuestionIndex + 1} but server is on Q${gameState.currentQuestionIndex + 1} — scoring against Q${answerQuestionIndex + 1}`);
      }

      const timeTaken = gameState.questionStartTime
        ? Date.now() - gameState.questionStartTime
        : 0;

      // Mark this question as answered (prevents double-scoring from retries)
      participant.answeredQuestions.add(answerQuestionIndex);
      participant.answeredCount++;

      const isCorrect = targetQ && data.answer === targetQ.correct;
      if (isCorrect) {
        participant.score += 1000;
        participant.correctCount++;
      }
      participant.totalTime += timeTaken;

      // For on-time answers, also set currentAnswer so host stats work
      if (!isLateAnswer) {
        participant.currentAnswer = data.answer;
        participant.currentTime = timeTaken;
        gameState.answers.set(socket.id, { answer: data.answer, time: timeTaken });
      }

      console.log(`[ANSWER ${isLateAnswer ? 'OK-LATE' : 'OK'}] ${participant.name}: ${data.answer} (correct=${targetQ?.correct}) → ${isCorrect ? '+1000' : 'wrong'} | total=${participant.score} | Q${answerQuestionIndex + 1}`);

      ack({ timeTaken, scored: true });
      broadcastGameStateThrottled(io);
    });

    socket.on('disconnect', () => {
      // Only remove participants in lobby (waiting). During active game, keep them
      // so scores and leaderboard are preserved even if connection drops.
      if (socket.id !== AI_PARTICIPANT_ID && gameState.status === 'waiting') {
        gameState.participants.delete(socket.id);
        broadcastGameState(io);
      }
      console.log(`Disconnected: ${socket.id}`);
    });
  });

  expressApp.all('*', (req: any, res: any) => handle(req, res));

  server.listen(port, hostname, () => {
    console.log(`\n🧠 Are You Smarter Than AI? — Quiz Server`);
    console.log(`   Local:    http://localhost:${port}`);
    console.log(`   Host:     http://localhost:${port}/host`);
    console.log(`   Session:  ${gameState.sessionCode}\n`);
  });
});
