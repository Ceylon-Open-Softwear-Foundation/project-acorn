# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Project Acorn** is a desktop application built with Tauri, combining a React frontend with a Rust backend. It uses Vite for development and Tailwind CSS for styling.

- **Type**: Tauri Desktop App (cross-platform: macOS, Windows, Linux)
- **Frontend**: React 19, Vite, Tailwind CSS 4
- **Backend**: Rust, Tauri 2, with plugin support
- **Package Manager**: Bun

## Development Commands

### Installation & Setup
```bash
bun install          # Install all dependencies (frontend + Rust backend)
```

### Development
```bash
bun run dev          # Start Vite development server (runs on port 1420)
bun run tauri dev    # Run full Tauri app with hot reload (use this for desktop testing)
```

### Building
```bash
bun run build        # Build React frontend for production (outputs to dist/)
bun run tauri build  # Build final desktop app executable
```

### Other
```bash
bun run preview      # Preview production build locally
bun run tauri        # Run Tauri CLI (for advanced tasks)
```

**Dev Workflow**: Use `bun run tauri dev` for active desktop development with hot reload. Use `bun run dev` only when debugging the Vite/React layer independently.

## Architecture

### Frontend (`/src`)
- **Entry**: `src/main.jsx` → `src/App.jsx`
- React components use Tailwind CSS classes for styling
- Color system uses semantic tokens (e.g., `text-foreground`, `bg-primary-background`, `text-accent`)
- Components can call Tauri commands via `@tauri-apps/api` (e.g., `invoke("greet", { name: "..." })`)

### Backend (`/src-tauri`)
- **Entry**: `src-tauri/src/main.rs` → `src-tauri/src/lib.rs`
- Tauri commands are defined with `#[tauri::command]` macro
- Commands are registered via `tauri::generate_handler![command_name]`
- Backend can use `tauri_plugin_opener` for opening files/URLs
- Configuration: `src-tauri/tauri.conf.json`

### Build Configuration
- **Vite**: `vite.config.js` (React plugin + Tailwind CSS plugin)
- **Tauri**: `src-tauri/tauri.conf.json` defines app metadata, build paths, window dimensions (800x600), and bundle settings
- **Frontend output**: Built to `dist/` directory, referenced by Tauri in `frontendDist: "../dist"`

## Frontend-Backend Communication

The app uses **Tauri's invoke system** to call Rust commands from React:

```javascript
// In React component
import { invoke } from "@tauri-apps/api/core";

const result = await invoke("greet", { name: "Alice" });
```

```rust
// In Rust backend
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}
```

## Key Files & Patterns

- **React components**: Use Tailwind utility classes; semantic color tokens are defined in the design system (check App.jsx for examples: `text-foreground`, `bg-card`, `text-accent`)
- **Tauri commands**: Defined in `src-tauri/src/lib.rs`, must be added to `tauri::generate_handler!` macro
- **Window config**: Edit `src-tauri/tauri.conf.json` to change title, dimensions, or bundle settings
- **Hot reload**: Only works with `bun run tauri dev`; frontend-only changes can use `bun run dev` but desktop context requires Tauri dev

## Important Notes

- The app runs on **Tauri port 1420** (fixed in vite.config.js); Vite is configured to ignore `src-tauri/` directory changes during development to prevent unnecessary rebuilds
- **Package manager**: Use `bun` exclusively (not npm or yarn)
- **Styling**: Tailwind CSS v4 uses the `@tailwindcss/vite` plugin; no separate config file needed
- **Rust compilation**: The backend is compiled to a static library and embedded in the final executable
