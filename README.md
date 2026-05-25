<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/7cf3b160-f922-4d5d-82ef-a6df6a1ee730

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`
Based on your file structure, this project is a web application named MoodDetectorAIstudio built using modern web development tools and integrated with Google’s AI ecosystem.
# Here is a breakdown of what the project does and how it is built:
# 1.- Core Functionality:
# AI-Powered Analysis: 
It utilizes Google's Gemini API to detect, analyze, and respond to user moods or emotional context based on user prompts.
# Full-Stack Architecture: 
Features a frontend client interface (index.html, src/) powered by a backend server environment (server.ts).
# 2.- Technical Stack
# Build Tool: 
Powered by Vite (vite.config.ts) for extremely fast local development and optimized production building.
# Language: 
Written in TypeScript (tsconfig.json), providing type safety and robust code structure.
# Database & Hosting: 
Fully configured for Google Firebase (firebase-blueprint.json, firestore.rules), enabling easy deployment and real-time database capabilities.
