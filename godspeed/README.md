# Godspeed

**Godspeed** is a browser-first roguelite maze shooter set inside ancient techno-divine labyrinths where forgotten technology has become indistinguishable from divinity.

The project is open source and developed with extensive AI assistance. All contributors—human and AI—should follow the project's design, architecture, and coding standards.

---

# Vision

> **Godspeed is a cooperative roguelite maze shooter where players descend through ancient techno-divine labyrinths, fighting intelligent guardians while the maze itself evolves.**

The initial release targets:

* Browser (Phaser 3 + TypeScript)
* Single-player
* Procedurally generated labyrinths
* Three biomes
* Five enemy types
* One boss
* 5–15 minute runs

Future milestones include local co-op, branching biomes, and an Electron desktop release.

---

# 🚨 AI Contributors: Read This First

If you are an AI coding agent (ChatGPT, Codex, Cursor, Claude Code, GitHub Copilot, or similar), **read the following documents before generating or modifying any code**:

1. `docs/ai_development_guide.md` **(Required)**
2. `docs/vision.md`
3. `docs/gameplay.md`
4. `docs/art_direction.md`
5. `docs/technical_design.md`

The **AI Development Guide** is the authoritative source for:

* Coding standards
* Architecture
* Project conventions
* Gameplay philosophy
* Documentation requirements
* Testing expectations
* Git workflow
* Definition of Done

When implementing a feature, AI should:

1. Read the relevant documentation.
2. Explain the implementation plan.
3. Implement the smallest complete increment.
4. Update documentation when behavior changes.
5. Keep the project vision and scope intact.

---

# Repository Structure

```text
docs/           Project documentation
assets/         Art, music, UI, and concept assets
game/           Game source code
docker/         Container configuration
kubernetes/     Deployment manifests
scripts/        Development scripts
tools/          Utility tools
```

---

# Technology Stack

* TypeScript
* Phaser 3
* Vite
* Docker
* Kubernetes
* GitHub Actions
* ESLint
* Prettier
* Vitest

---

# Development Philosophy

Godspeed prioritizes:

* Fast, responsive gameplay
* Simple but deep mechanics
* High replayability
* Clean architecture
* Strong atmosphere
* Maintainable code
* AI-assisted development with human oversight

Gameplay quality always takes precedence over visual complexity.

---

# Documentation

The `docs/` directory is the project's source of truth.

Any significant gameplay, architectural, or technical change should be reflected in the appropriate document before or alongside the implementation.

---

# License

This project is open source. License details will be added as the project evolves.

