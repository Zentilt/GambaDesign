# GambaDesign
## Pachinko Roguelite · Creature Collection

A browser-based pachinko roguelite where every ball dropped is an adventure. Build powerful machines, collect creatures, discover relics, and chain synergies as you progress through procedurally generated stages.

---

### 🎮 How to Play

Open `index.html` in a modern browser — no build step required.

1. **Choose a path** — Safe Route (reliable rewards) or Danger Route (higher risk, higher reward).
2. **Drop balls** — Click on the canvas to launch a ball. Watch it bounce through pegs and bumpers.
3. **Collect rewards** — After each stage, pick a creature, relic, or temporary upgrade.
4. **Upgrade your machine** — Spend gold on bumpers, portals, multipliers, and more.
5. **Defeat bosses** — Every 5 stages is a boss with special rules.
6. **Progress** — Complete runs to earn permanent gold for the meta-progression shop.

---

### ⚙️ Core Features

| Feature | Description |
|---|---|
| **Physics Simulation** | Ball bounces realistically off pegs, bumpers, and walls |
| **Creature Collection** | 15 unique creatures, each with a passive ability |
| **Relic System** | 15 relics with powerful effects and synergy potential |
| **Synergy System** | Specific creature + relic combinations unlock cascade effects |
| **Procedural Boards** | 8 themed environments (Forest, Ocean, Volcano, Sky, Crystal Cave, Ancient Ruins, Mechanical Factory, Space Station) |
| **Machine Building** | Persistent upgrades — bumpers, portals, spinning wheels, flippers, multipliers |
| **Roguelite Progression** | Temporary upgrades per run + permanent meta-progression |
| **Boss Stages** | Every 5th stage has special rules: moving barriers, gravity shifts, time limits, weak points |
| **Risk vs Reward** | Safe path offers reliable slots; Danger path offers 100× multipliers with FAIL slots |

---

### 🐉 Example Synergy

**Lava Phoenix** (Phoenix + Fireball + Lava Core)

> Fireballs ignite bumpers → burning bumpers generate bonus balls → Phoenix relaunches missed balls → cascading chain reaction

---

### 🦄 Creatures (sample)

- 🟢 **Slime** — Every 5th bumper hit spawns an extra ball
- 🐢 **Turtle** — Balls slow down, increasing combo opportunities
- 🔥 **Phoenix** — 35% chance to relaunch a ball that lands in a losing slot
- 🍄 **Mushroom** — Adds 3 bonus pegs to the board
- 👻 **Ghost** — 15% chance to phase through obstacles
- 🦄 **Unicorn** *(Legendary)* — One slot becomes a 10× Jackpot slot each run

---

### 📁 Project Structure

```
index.html          Main entry point
styles/main.css     UI styles
src/
  main.js           Bootstrap
  game.js           Core game engine & screen management
  board.js          Board generation & slot resolution
  ball.js           Ball physics & creature interactions
  renderer.js       Canvas drawing utilities
  creatures.js      Creature definitions & passive system
  relics.js         Relic definitions & synergy detection
  upgrades.js       Temporary, machine & permanent upgrades
  progression.js    Save system & roguelite state
  constants.js      Game-wide constants
  utils.js          Utility helpers
```
