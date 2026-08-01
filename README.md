# Reliance Metrics — Team Offsite Quiz

A live, real-time quiz application for the Reliance Metrics team offsite event. Features a Host Dashboard for the Quiz Master and a mobile-friendly Participant Interface that anyone can join by scanning a QR code.

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Start development server
npm run dev

# 3. Open Host Dashboard
#    → http://localhost:3000/host

# 4. Participants scan the QR code shown on Host Dashboard
#    → or go to http://localhost:3000
```

## How It Works

**Host (Quiz Master):**
1. Open `/host` on your laptop
2. Share the QR code on the big screen
3. Wait for players to join
4. Press **Start Quiz**
5. Control the flow: reveal answers, show leaderboard, next question

**Participants (Employees):**
1. Scan the QR code with your phone
2. Enter your name
3. Tap **Join Quiz**
4. Answer questions as they appear
5. See your score and ranking live

## Tech Stack

- **Next.js 14** + TypeScript + Tailwind CSS
- **Socket.io** for real-time communication
- **Framer Motion** for animations
- **react-confetti** for celebrations
- **qrcode.react** for QR code generation
- **Express** custom server for Socket.io integration

## Project Structure

```
reliance-quiz/
├── server.ts              # Custom Express + Socket.io server
├── src/
│   ├── app/
│   │   ├── layout.tsx     # Root layout
│   │   ├── globals.css    # Global styles
│   │   ├── page.tsx       # Participant interface (/)
│   │   └── host/
│   │       └── page.tsx   # Host dashboard (/host)
│   ├── data/
│   │   └── questions.json # 20 quiz questions
│   └── lib/
│       └── socket.ts      # Socket.io client helper
├── package.json
├── tailwind.config.ts
├── tsconfig.json
├── tsconfig.server.json
├── next.config.js
└── .env.example
```

## Editing Questions

Open `src/data/questions.json`. Each question follows this format:

```json
{
  "id": 1,
  "question": "Your question here?",
  "options": ["A. Option 1", "B. Option 2", "C. Option 3", "D. Option 4"],
  "correct": "C",
  "aiResponse": "A funny predefined response shown after the answer is revealed."
}
```

## Adding Your Logo

Replace the `RM` placeholder in the header components:
- `src/app/page.tsx` — participant join screen
- `src/app/host/page.tsx` — host dashboard

Replace the gradient div containing "RM" with an `<img>` tag pointing to your logo in the `public/` folder.

## Environment Variables

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

| Variable | Description | Default |
|----------|-------------|---------|
| `NEXT_PUBLIC_APP_URL` | Public URL (for QR code) | `http://localhost:3000` |
| `PORT` | Server port | `3000` |

## Deployment

Since this app uses Socket.io (WebSockets), it needs a server that supports persistent connections. **Vercel does not support WebSockets**, so use one of these:

### Railway (Recommended)

```bash
# 1. Install Railway CLI
npm i -g @railway/cli

# 2. Login
railway login

# 3. Init project
railway init

# 4. Deploy
railway up

# 5. Set environment variables in Railway dashboard:
#    PORT = 3000
#    NEXT_PUBLIC_APP_URL = https://your-app.railway.app
```

### Render

1. Push code to a GitHub repo
2. Go to [render.com](https://render.com) → New Web Service
3. Connect your repo
4. Set:
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm run start`
   - **Environment:** Node
5. Add env vars: `PORT=3000`, `NEXT_PUBLIC_APP_URL=https://your-app.onrender.com`

### Fly.io

```bash
# 1. Install flyctl
curl -L https://fly.io/install.sh | sh

# 2. Launch
fly launch

# 3. Deploy
fly deploy
```

### Local network (simplest for an offsite)

If everyone is on the same WiFi:

```bash
# Find your local IP
ifconfig | grep "inet " | grep -v 127.0.0.1

# Start the server
npm run dev

# Share: http://YOUR_LOCAL_IP:3000
```

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server with hot reload |
| `npm run build` | Build for production |
| `npm run start` | Start production server |
| `npm run build:start` | Build and start in one command |

## Scoring

- **Correct answer:** 1000 base points
- **Speed bonus:** Up to 500 extra points (faster = more points)
- **Leaderboard tiebreaker:** Fastest total response time wins

## License

Internal use — Reliance Metrics Philadelphia Offsite 2025
