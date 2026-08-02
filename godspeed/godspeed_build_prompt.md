# Proposed Build Prompt

Create a browser-based spiritual successor to the Commodore 64 game *Wizard of Wor* that runs entirely in modern browsers and can be deployed as a static web app in a Docker container on Kubernetes.

## Goal

Build a fun, original, rights-safe retro arcade game that captures the tension, pacing, and maze-combat feel of the classic, while using new art, new audio, new code, and new names. The result should be playable in a browser, easy to run locally, and straightforward to host on a Kubernetes cluster.

## Core Requirements

- Use TypeScript and a modern 2D browser game framework such as Phaser 3.
- Render to HTML5 canvas and support responsive scaling for desktop and mobile.
- Implement a complete game loop with:
  - title screen
  - player movement
  - firing and hit detection
  - enemy spawning and AI
  - score tracking
  - lives
  - wave/level progression
  - game over and restart
- Add keyboard controls first, then optional gamepad and touch controls.
- Include sound effects, background music hooks, and a simple settings menu.
- Keep the project original:
  - do not copy the original game code
  - do not use original assets
  - do not use protected names or trademarks in the shipped product
- Add a high-score system using browser storage or a lightweight backend API if needed.
- Structure the project cleanly with separate modules for scenes, entities, systems, assets, and configuration.
- Provide a Dockerfile, Kubernetes manifests, and deployment notes.
- Include basic automated tests for core gameplay rules where practical.

## Suggested Architecture

- **Frontend:** TypeScript + Phaser 3 + Vite
- **Packaging:** Static build served by Nginx or another small web server
- **Deployment:** Docker image + Kubernetes Deployment/Service/Ingress
- **State:** Stateless app; store only non-critical data in browser storage
- **Quality:** Linting, formatting, unit tests, and a production build check in CI

## Development Plan

1. Build a vertical slice with one maze, one player, one enemy type, and one win/lose loop.
2. Add combat polish, enemy variety, and scoring.
3. Expand to multiple maze layouts and progression systems.
4. Add menu flow, audio, accessibility options, and responsive UX.
5. Containerize the app and prepare Kubernetes deployment assets.
6. Add CI and documentation for build, run, and deploy steps.

## Deliverables

- Complete source code
- Local development instructions
- Production build output
- Dockerfile
- Kubernetes deployment manifests
- Short README covering controls, architecture, and deployment

## Output Expectations

The final implementation should feel like a modern arcade game inspired by the original:
- fast
- readable
- tense
- replayable
- easy to launch in a browser
- easy to host on Kubernetes
