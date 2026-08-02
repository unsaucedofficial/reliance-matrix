# Reliance Matrix — Strategic Offsite 2026 Quiz

A live, real-time quiz application for the Reliance Matrix Strategic Offsite 2026.

## Quick Start

```bash
npm install
npm run dev
```

- **Host Dashboard:** http://localhost:3000/host
- **Participant Page:** http://localhost:3000

## Project Structure

```
reliance-quiz/
├── server.ts                  # Express + Socket.io server
├── public/
│   └── logo.png               # Reliance Matrix logo
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── globals.css
│   │   ├── page.tsx           # Participant interface
│   │   └── host/
│   │       └── page.tsx       # Host dashboard
│   ├── data/
│   │   └── questions.json     # 20 quiz questions
│   └── lib/
│       └── socket.ts          # Socket.io client
├── package.json
├── tailwind.config.ts
├── tsconfig.json
├── tsconfig.server.json
├── next.config.js
├── postcss.config.js
└── .env.example
```

## Deployment (Render)

1. Push to GitHub
2. Go to render.com → New → Web Service
3. Build Command: `npm install && npm run build`
4. Start Command: `npm run start`
5. Add env vars: `PORT=3000`, `NEXT_PUBLIC_APP_URL=<your-render-url>`

## Scoring

- Correct answer: 1000 points + up to 500 speed bonus
- Tiebreaker: fastest total response time
