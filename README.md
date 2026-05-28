# Memory Evolved MCP

Three-tier memory for any AI agent. Add Claude Code, Cursor, or any MCP-compatible client.

```
                 ╭──────────────────────╮
                 │   YOUR AI AGENT       │
                 │  knows everything     │
                 │  remembers everything │
                 ╰──────────┬───────────╯
                            │
                    MCP Protocol
                            │
         ┌──────────────────┴──────────────────┐
         │         MEMORY EVOLVED MCP           │
         │                                      │
         │  📝 MEMORY     🔍 SESSION    🧠 SKILL│
         │  Durable facts  Full-text     Reusable│
         │  Auto-injected  search over   proce- │
         │  every turn     all sessions  dures  │
         └──────────────────────────────────────┘
```

## Install

```bash
npx mem-evolved
```

## Add to Claude Code

Add to your `claude.json`:

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

That's it. SQLite auto-creates in `~/.mem-evolved/`. No config. No Docker. No database setup.

## Tools

### Memory — Durable Facts
```
memory_add("use pnpm, not npm")           → auto-injected every session
memory_search("what port does the API use?")
memory_list()
memory_remove("pnpm")
memory_replace("pnpm", "use bun instead")
```

Memories persist across every session. They're fetched automatically on connect and injected into the agent's context for free — no tool call needed to recall.

### Session Search — Safety Net
```
session_search("what did we decide about auth?")
```

FTS5 full-text search over all past conversations. Even if you forgot to save something to memory, it's still retrievable.

### Skills — Reusable Procedures
```
skill_save(name="debug-redis", content="...")
skill_load("debug-redis")
skill_list()
skill_patch("debug-redis", "old step", "new step")
skill_delete("debug-redis")
```

Skills are markdown files with executable workflows. Save anything you do more than once. Skills self-repair: if you load one and find it wrong, `skill_patch` fixes it immediately.

## How It's Different

| Feature | mem-evolved | Basic Memory | Claude Code built-in |
|---------|:-----------:|:------------:|:--------------------:|
| Two-tier memory (user/project) | ✅ | ❌ | ❌ |
| Session search (FTS5) | ✅ | ❌ | ❌ |
| Reusable skills | ✅ | ❌ | ❌ |
| Auto-injected context | ✅ | ❌ | ❌ |
| Self-repair on use | ✅ | ❌ | ❌ |
| Cross-project memory | ✅ | ❌ | ❌ |

## Architecture

Data lives in `~/.mem-evolved/`:

```
~/.mem-evolved/
├── memory.db          # SQLite: memories + session search (FTS5)
└── skills/            # Markdown skill files
    ├── tdd/SKILL.md
    ├── debug-redis/SKILL.md
    └── deploy-flow/SKILL.md
```

The auto-injection engine reads all memories on connect and serves them as an MCP Resource (`memory://current`). The agent sees them every turn without making a tool call.

## License

MIT
