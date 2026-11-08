# Real-Time Interview Assistant

A browser-based interview practice assistant that listens to microphone or shared-tab audio, transcribes speech with Deepgram, detects interview questions, and streams suggested answers from Groq. Answers use the resume and job description you provide. Review suggestions before using them.

## Requirements

- Node.js 20 or newer and npm
- Deepgram and Groq API keys
- Chrome or Edge for shared-tab audio; microphone capture is also supported

## Setup

1. Install dependencies:

   ```bash
   npm run install:all
   ```

2. Copy `.env.example` to `.env` in the project root and add your keys:

   ```dotenv
   DEEPGRAM_API_KEY=your_key
   GROQ_API_KEY=your_key
   ```

   The default server and client URLs are `http://localhost:5000` and `http://localhost:5173`. Change `PORT` or `CLIENT_URL` in `.env` only if needed. API keys stay on the server; do not commit `.env`.

3. Start the app:

   ```bash
   npm run dev
   ```

4. Open <http://localhost:5173>, enter your resume or summary and the job description, save them, then start a microphone or tab-audio session. For tab audio, choose a browser tab and enable **Share tab audio**.

The server health endpoint is <http://localhost:5000/api/health>.

## Useful commands

```bash
npm run dev          # Start server and client
npm run dev:server   # Start only the server
npm run dev:client   # Start only the client
npm run typecheck    # Check TypeScript
npm test             # Run server tests
npm run build        # Build server and client
npm run format:check # Check formatting
npm run format       # Format supported project files
```

## Notes

- The app sends audio to Deepgram and interview context and questions to Groq. Audio and context are not persisted by this app; provider terms apply to data sent to those services.
- Question detection uses English-oriented heuristics. Pauses, accents, or overlapping speech can affect detection.
- Sessions and answer history are in memory. Refreshing or restarting the server ends the session.
- This is a local proof of concept without user authentication. Do not expose it publicly as-is.
