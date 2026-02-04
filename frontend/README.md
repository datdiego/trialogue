# Trialogue Frontend

Next.js 16 frontend with App Router and Tailwind CSS.

## Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Structure

```
app/                  # Next.js App Router
  ├── layout.tsx      # Root layout
  ├── page.tsx        # Home page
  └── globals.css     # Global styles with Tailwind

components/           # React components
  ├── chat/          # Chat interface components
  ├── settings/      # Settings modal components
  └── ui/            # Reusable UI components

lib/                  # Utilities
  ├── api.ts         # Backend API client
  └── storage.ts     # LocalStorage helpers
```

## Tech Stack

- Next.js 16 (App Router)
- React 19
- TypeScript
- Tailwind CSS
- Lucide Icons
