# Rizz Dice — Ludo King Redefined 🎲

A browser-based Ludo game built with **React 19**, **TypeScript**, **Vite**, and **Tailwind CSS**, featuring an **Apple-inspired dark glassmorphism UI**, **champagne gold accents**, an **integrated voice reactions soundboard**, and gameplay mechanics.

---

## ✨ Features

- **Classic Ludo Mechanics with Clockwise Turns**:
  - Full support for **2, 3, and 4 players** with clockwise sequence.
  - 100% fair random dice rolling (1–6).
  - 3-consecutive-six forfeit penalty.
  - Safe spots (8 marked cells with golden stars).
  - Accurate token entry on rolling 6, outer track movement, home stretch (57-step track), and victory royale.
  - Skipping of finished players so remaining players can continue battling for runner-up positions.
- **Pass 'N Play & VS Computer Modes**:
  - Offline local multiplayer on a single device.
  - Heuristic bot AI for competitive single-player gameplay.
- **Apple-Inspired Glassmorphic UI**:
  - Charcoal (`#111111` / `#161616`) surfaces, subtle glass borders, and champagne gold (`#E9BC42`) highlights.
  - Enlarged interactive dice (80px desktop / 64px mobile) with roll animations.
  - In-game live player renaming with instant persistence.
  - Discrete event reaction bubbles on player stations.
- **Audio & Voice Reactions Soundboard**:
  - Independent audio toggles for **Sound Effects**, **Theme Music**, and **Voice Reactions**.
  - **Manual Soundboard**: Browse and play audio taunts anytime without affecting turn order or tokens.
  - **Configurable Event Reactions**: Configure custom clips or system default sounds for *Token Captured*, *Rolling a Six*, *Reaching Home*, and *Victory*.
  - Master event reaction toggle (defaults to OFF for pure classic sound effects).
- **Session Recovery & Local Storage**:
  - In-progress matches automatically survive browser refreshes without losing player positions, active turns, or dice state.
  - Strict schema validation protects against corrupted storage sessions.

---

## 🛠️ Tech Stack

- **Framework**: [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- **Bundler & Dev Server**: [Vite 8](https://vitejs.dev/)
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/)
- **Icons**: [Lucide React](https://lucide.dev/)
- **Effects**: [Canvas Confetti](https://github.com/catdad/canvas-confetti)
- **Linter**: [Oxlint](https://oxc.rs/)

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+ recommended)
- `npm`

### Installation

```bash
# Clone the repository
git clone https://github.com/ayushcmd/RizzDice.git

# Navigate to the project directory
cd RizzDice

# Install dependencies
npm install
```

### Development Server

```bash
npm run dev
```

Open `http://localhost:5173` in your browser.

### Run Tests

```bash
npm test
```

### Linting

```bash
npm run lint
```

### Production Build

```bash
npm run build
```

The optimized production bundle will be generated in the `dist/` directory.

---

## 📜 License

MIT License. See [LICENSE](LICENSE) for details.
