# Simple RPG Engine

A web platform for single-player RPG adventures: authors describe a story as a
multi-file YAML package (**Scenario**), and the shared engine runs it with
common rules and a common UI. See `CONTEXT.md` for the domain language and
`docs/spec/architecture.md` for the normative architecture.

## Run

Prerequisites: Node 24 LTS and npm.

```sh
npm ci
npm run migrate   # create the SQLite schema (also runs before `dev`/`start`)
npm run dev       # http://localhost:3000, reloads edited Scenarios on request
```

Production build locally:

```sh
npm run build
npm run start     # runs the migrations first, then serves the build
```

Validate a Scenario package:

```sh
npm run validate scenarios/whispering-woods
```

Run the checks:

```sh
npm run lint
npm run typecheck
npm test          # unit and integration tests (vitest)
npm run test:e2e  # Playwright smoke test against a production build
```

## Docker

The prototype runs as one self-hosted, long-lived Node process with a
persistent volume holding the SQLite database and the Scenario directory.

```sh
docker build -t simple-rpg-engine .
docker run -p 3000:3000 -v rpg-data:/data simple-rpg-engine
```

The entrypoint seeds an empty Scenario directory from the scenarios bundled
into the image, runs `npm run migrate`, then starts the server — so the first
boot against an empty volume creates the schema before serving traffic, and a
Playthrough survives a container restart as long as the same volume is
mounted. Open http://localhost:3000 and start a Playthrough of
whispering-woods.

| Environment variable | Default              | Purpose                                    |
| -------------------- | -------------------- | ------------------------------------------ |
| `DATABASE_PATH`      | `/data` in Docker, `./data.sqlite` locally | SQLite file (lives on the volume) |
| `SCENARIO_DIR`       | `/data/scenarios` in Docker, `./scenarios` locally | Scenario collection directory |
| `PORT` / `HOSTNAME`  | `3000` / `0.0.0.0` in Docker | Standalone server bind address   |
