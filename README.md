# mem-evolved 🧠⚡

**Memory, session search, and skills for any AI agent.**

Your coding agent remembers everything across every session — without a database, without a cloud service, without subscriptions. Just one `npx` command and SQLite.

```bash
npx mem-evolved
```

## What it does

Three tiers of agent memory, same pattern that powers Hermes Agent:

| Tier | What | Why |
|------|------|-----|
| **Memory** | Durable key-value facts | Your agent remembers preferences, conventions, and decisions across sessions |
| **Session Search** | FTS5 full-text search over past conversations | Nothing is lost — find any past decision, error, or context |
| **Skills** | Reusable markdown procedures | Knowledge compounds — your agent gets better at recurring tasks |

**Auto-injection via MCP Resources** — every time your agent starts, its stored memories are injected into the prompt automatically. No tool call needed. Your agent is smarter from turn 1.

## Quick Start

```bash
# Run directly — no install required
npx mem-evolved
```

Data is stored at `~/.mem-evolved/` — SQLite database + skills directory. Portable, inspectable, deletable.

Set a custom data directory:

```bash
MEM_EVOLVED_DIR=/path/to/data npx mem-evolved
```

## Integration Guides

### Claude Code

Add to `~/.claude/claude.json`:

```json
{
  "mcpServers": {
    "mem-evolved": {
      "command": "npx",
      "args": ["mem-evolved"]
    }
  }
}
```

Restart Claude Code. Your agent now has persistent memory, session search, and skills.

<details>
<summary>Test it</summary>

```
> memory_add content="I prefer pnpm over npm" target="user"
> memory_list
> skill_save name="deploy-flow" content="# Deploy\n1. pnpm build\n2. pnpm deploy"
```
</details>

### Cursor

Add to `.cursor/mcp.json` in your project:

```json
{
  "mcpServers": {
    "mem-evolved": {
      "command": "npx",
      "args": ["mem-evolved"]
    }
  }
}
```

Open Cursor Settings → Features → MCP → Refresh. Tools appear automatically.

<details>
<summary>Test it</summary>

Ask your agent: *"What do I prefer for package management?"* after saving a memory. It will retrieve the fact from the auto-injected resource.
</details>

### Any MCP-compatible agent

The pattern is the same — configure your MCP client to spawn `npx mem-evolved` as a stdio server.

## Tools Reference

### Memory Tools

| Tool | Args | Description |
|------|------|-------------|
| `memory_add` | `content`, `target` (user/memory) | Save a durable fact |
| `memory_search` | `query` | Full-text search across memories |
| `memory_list` | `target` (optional) | List all stored memories |
| `memory_remove` | `old_text` | Remove a memory by content match |
| `memory_replace` | `old_text`, `content` | Update an outdated memory |

**Target scopes:**
- `"user"` — personal preferences, style, habits (the agent's user)
- `"memory"` — project environment facts, conventions, decisions

### Session Search

| Tool | Args | Description |
|------|------|-------------|
| `session_search` | `query`, `limit` | FTS5 full-text search over past sessions |

### Skill Tools

| Tool | Args | Description |
|------|------|-------------|
| `skill_save` | `name`, `content`, `category` | Save a reusable procedure |
| `skill_load` | `name` | Load a skill by name |
| `skill_list` | `category` | List available skills |
| `skill_patch` | `name`, `old_string`, `new_string` | Update a skill |
| `skill_delete` | `name` | Remove a skill |

## MCP Resources (Auto-Injection)

Three resources are exposed and read automatically by the agent every turn:

| URI | Content |
|-----|---------|
| `memory://current` | All memories, formatted for prompt injection |
| `memory://user` | User-specific memories only |
| `memory://project` | Project-specific memories only |

No manual tool call needed. The agent starts every session with context already loaded.

## Design Principles

- **Declarative only** — save facts, not instructions. If a fact will be stale in 7 days, don't save it.
- **Self-improving** — skills patch themselves. If a skill is wrong, fix it immediately.
- **Local first** — all data in `~/.mem-evolved/`. Your data stays yours. No cloud, no telemetry.
- **Zero config** — `npx mem-evolved` is the only command. Everything else is your MCP client.
- **Portable** — copy `~/.mem-evolved/` to any machine. Resumes where you left off.

## Why not just use [existing tool]?

| Tool | mem-evolved |
|------|------------|
| File-based context windows | Manual, fragile, easy to forget |
| Vector databases | Overkill for agent memory, need cloud or heavy infra |
| Hermes Agent | Full agent framework (task scheduling, TUI, plugins, 150+ tools) — mem-evolved is **just** the memory layer, extractable into any agent |
| In-memory conversation buffers | Lost on restart. mem-evolved persists across sessions. |

mem-evolved is the memory system extracted from [Hermes Agent](https://hermes-agent.nousresearch.com), packaged as a standalone MCP server. You get the same memory architecture without the full framework.

## License

MIT
