#!/usr/bin/env node

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} = require('@modelcontextprotocol/sdk/types.js');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// ─── CONFIG ──────────────────────────────────────────────────
const MEM_DIR = process.env.MEM_EVOLVED_DIR || path.join(require('os').homedir(), '.mem-evolved');
const DB_PATH = path.join(MEM_DIR, 'memory.db');
const SKILLS_DIR = path.join(MEM_DIR, 'skills');

if (!fs.existsSync(MEM_DIR)) fs.mkdirSync(MEM_DIR, { recursive: true });
if (!fs.existsSync(SKILLS_DIR)) fs.mkdirSync(SKILLS_DIR, { recursive: true });

// ─── DATABASE ────────────────────────────────────────────────
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS memories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT NOT NULL,
    target TEXT NOT NULL DEFAULT 'memory' CHECK(target IN ('user','memory')),
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    query TEXT NOT NULL,
    response TEXT,
    context TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE VIRTUAL TABLE IF NOT EXISTS sessions_fts USING fts5(query, response, context, content=sessions);
`);

// ─── HELPERS ──────────────────────────────────────────────────
function getMemories(target = null) {
  if (target) {
    return db.prepare('SELECT * FROM memories WHERE target = ? ORDER BY updated_at DESC').all(target);
  }
  return db.prepare('SELECT * FROM memories ORDER BY target, updated_at DESC').all();
}

function formatMemoriesForPrompt(rows) {
  if (!rows.length) return '*No stored memories yet.*';
  const user = rows.filter(r => r.target === 'user');
  const proj = rows.filter(r => r.target === 'memory');
  let out = '';
  if (user.length) out += '**User Preferences:**\n' + user.map(r => `- ${r.content}`).join('\n') + '\n\n';
  if (proj.length) out += '**Project Context:**\n' + proj.map(r => `- ${r.content}`).join('\n');
  return out.trim();
}

// ─── MCP SERVER ──────────────────────────────────────────────
const server = new Server(
  { name: 'mem-evolved', version: '0.1.0' },
  { capabilities: { resources: {}, tools: {} } }
);

// ─── TOOLS ───────────────────────────────────────────────────
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'memory_add',
      description: 'Save a durable fact. Use target="user" for personal preferences, '
        + 'target="memory" for project environment facts. Facts must pass the "7-day test" — '
        + 'if it will be stale in a week, do not save it. Write declarative facts, not instructions. '
        + 'Save the important stuff, skip the noise.',
      inputSchema: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'The fact to remember. Declarative only.' },
          target: { type: 'string', enum: ['user', 'memory'], default: 'memory', description: '"user" for personal preferences, "memory" for project context' }
        },
        required: ['content']
      }
    },
    {
      name: 'memory_search',
      description: 'Full-text search over all stored memories. Finds relevant facts quickly.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' }
        },
        required: ['query']
      }
    },
    {
      name: 'memory_list',
      description: 'List all stored memories, optionally filtered by target scope.',
      inputSchema: {
        type: 'object',
        properties: {
          target: { type: 'string', enum: ['user', 'memory'], description: 'Filter by scope' }
        }
      }
    },
    {
      name: 'memory_remove',
      description: 'Remove a memory by matching its content text.',
      inputSchema: {
        type: 'object',
        properties: {
          old_text: { type: 'string', description: 'Text to match in the memory content' }
        },
        required: ['old_text']
      }
    },
    {
      name: 'memory_replace',
      description: 'Replace an outdated memory with updated content.',
      inputSchema: {
        type: 'object',
        properties: {
          old_text: { type: 'string', description: 'Text to match in the existing memory' },
          content: { type: 'string', description: 'New replacement text' }
        },
        required: ['old_text', 'content']
      }
    },
    {
      name: 'session_search',
      description: 'Full-text search over all past sessions. Use this when you need context '
        + 'that may not have been saved to memory yet. Searches queries, responses, and context.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          limit: { type: 'number', default: 5, description: 'Max results to return' }
        },
        required: ['query']
      }
    },
    {
      name: 'skill_save',
      description: 'Save a reusable procedure/workflow as a skill. Skills are step-by-step '
        + 'markdown files that agents can load and follow. After successfully completing a '
        + 'complex task (5+ tool calls), save the approach as a skill so you can reuse it.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Skill name (lowercase, hyphens allowed)' },
          content: { type: 'string', description: 'Full SKILL.md content. Include YAML frontmatter with name and description, then markdown body with numbered steps.' },
          category: { type: 'string', description: 'Optional category/domain for organization' }
        },
        required: ['name', 'content']
      }
    },
    {
      name: 'skill_load',
      description: 'Load a saved skill by name. Returns the full SKILL.md content.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Skill name to load' }
        },
        required: ['name']
      }
    },
    {
      name: 'skill_list',
      description: 'List all available skills, optionally filtered by category.',
      inputSchema: {
        type: 'object',
        properties: {
          category: { type: 'string', description: 'Optional category filter' }
        }
      }
    },
    {
      name: 'skill_patch',
      description: 'Update a skill by replacing text. If you load a skill and find it '
        + 'outdated or incorrect, patch it immediately rather than working around it.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Name of the skill to update' },
          old_string: { type: 'string', description: 'Text to find and replace' },
          new_string: { type: 'string', description: 'Replacement text' }
        },
        required: ['name', 'old_string', 'new_string']
      }
    },
    {
      name: 'skill_delete',
      description: 'Delete a saved skill by name.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Skill name to delete' }
        },
        required: ['name']
      }
    }
  ]
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    // ── MEMORY TOOLS ──────────────────────────────────────────
    if (name === 'memory_add') {
      const target = args.target || 'memory';
      db.prepare('INSERT INTO memories (content, target) VALUES (?, ?)').run(args.content, target);
      return { content: [{ type: 'text', text: `Saved to ${target} memory.` }] };
    }

    if (name === 'memory_search') {
      const rows = db.prepare(
        'SELECT * FROM memories WHERE content LIKE ? ORDER BY updated_at DESC LIMIT 20'
      ).all(`%${args.query}%`);
      if (!rows.length) return { content: [{ type: 'text', text: 'No matching memories found.' }] };
      return { content: [{ type: 'text', text: rows.map(r => `[${r.target}] ${r.content} (${r.updated_at})`).join('\n') }] };
    }

    if (name === 'memory_list') {
      const rows = getMemories(args.target || null);
      if (!rows.length) return { content: [{ type: 'text', text: 'No memories stored.' }] };
      return { content: [{ type: 'text', text: rows.map(r => `[${r.target}] ${r.content}`).join('\n') }] };
    }

    if (name === 'memory_remove') {
      const result = db.prepare('DELETE FROM memories WHERE content LIKE ?').run(`%${args.old_text}%`);
      if (result.changes === 0) return { content: [{ type: 'text', text: 'No matching memory found to remove.' }] };
      return { content: [{ type: 'text', text: `Removed ${result.changes} memory(ies).` }] };
    }

    if (name === 'memory_replace') {
      const found = db.prepare('SELECT * FROM memories WHERE content LIKE ?').get(`%${args.old_text}%`);
      if (!found) return { content: [{ type: 'text', text: 'No matching memory found to replace.' }] };
      db.prepare('UPDATE memories SET content = ?, updated_at = datetime(\'now\') WHERE id = ?').run(args.content, found.id);
      return { content: [{ type: 'text', text: 'Memory updated.' }] };
    }

    // ── SESSION SEARCH ────────────────────────────────────────
    if (name === 'session_search') {
      const limit = Math.min(args.limit || 5, 50);
      // Log the query for future searchability
      db.prepare('INSERT INTO sessions (query) VALUES (?)').run(args.query);
      // Search existing sessions
      try {
        const rows = db.prepare(
          `SELECT query, response, created_at FROM sessions_fts WHERE sessions_fts MATCH ? ORDER BY rank LIMIT ?`
        ).all(args.query, limit);
        if (!rows.length) return { content: [{ type: 'text', text: 'No matching sessions found.' }] };
        return { content: [{ type: 'text', text: rows.map(r => `[${r.created_at}] ${r.query}\n${r.response || ''}`.trim()).join('\n\n---\n\n') }] };
      } catch (e) {
        // FTS5 might fail if no data yet
        return { content: [{ type: 'text', text: 'No session history yet. Use memory_add to start building context.' }] };
      }
    }

    // ── SKILL TOOLS ───────────────────────────────────────────
    if (name === 'skill_save') {
      const skillDir = args.category ? path.join(SKILLS_DIR, args.category, args.name) : path.join(SKILLS_DIR, args.name);
      if (!fs.existsSync(skillDir)) fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), args.content);
      return { content: [{ type: 'text', text: `Skill "${args.name}" saved.` }] };
    }

    if (name === 'skill_load') {
      // Search all subdirectories for matching skill
      const findSkill = (name) => {
        const walk = (dir) => {
          const files = fs.readdirSync(dir, { withFileTypes: true });
          for (const f of files) {
            const full = path.join(dir, f.name);
            if (f.isDirectory()) {
              const found = walk(full);
              if (found) return found;
            } else if (f.name === 'SKILL.md' && dir.endsWith(name)) {
              return full;
            }
          }
          return null;
        };
        return walk(SKILLS_DIR);
      };

      const skillPath = findSkill(args.name);
      if (!skillPath) return { content: [{ type: 'text', text: `Skill "${args.name}" not found.` }] };
      const content = fs.readFileSync(skillPath, 'utf-8');
      return { content: [{ type: 'text', text: content }] };
    }

    if (name === 'skill_list') {
      const walk = (dir, prefix = '') => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        const skills = [];
        for (const e of entries) {
          const full = path.join(dir, e.name);
          if (e.isDirectory()) {
            if (fs.existsSync(path.join(full, 'SKILL.md'))) {
              skills.push(prefix + e.name);
            } else {
              skills.push(...walk(full, prefix + e.name + '/'));
            }
          }
        }
        return skills;
      };
      const skills = walk(SKILLS_DIR);
      if (!skills.length) return { content: [{ type: 'text', text: 'No skills saved yet.' }] };
      return { content: [{ type: 'text', text: 'Available skills:\n' + skills.map(s => `- ${s}`).join('\n') }] };
    }

    if (name === 'skill_patch') {
      const findSkill = (name) => {
        const walk = (dir) => {
          const files = fs.readdirSync(dir, { withFileTypes: true });
          for (const f of files) {
            const full = path.join(dir, f.name);
            if (f.isDirectory()) {
              const found = walk(full);
              if (found) return found;
            } else if (f.name === 'SKILL.md' && dir.endsWith(name)) {
              return full;
            }
          }
          return null;
        };
        return walk(SKILLS_DIR);
      };
      const skillPath = findSkill(args.name);
      if (!skillPath) return { content: [{ type: 'text', text: `Skill "${args.name}" not found.` }] };
      const content = fs.readFileSync(skillPath, 'utf-8');
      if (!content.includes(args.old_string)) return { content: [{ type: 'text', text: 'old_string not found in skill.' }] };
      const updated = content.replace(args.old_string, args.new_string);
      fs.writeFileSync(skillPath, updated);
      return { content: [{ type: 'text', text: `Skill "${args.name}" patched.` }] };
    }

    if (name === 'skill_delete') {
      const findSkillDir = (name) => {
        const walk = (dir) => {
          const files = fs.readdirSync(dir, { withFileTypes: true });
          for (const f of files) {
            const full = path.join(dir, f.name);
            if (f.isDirectory()) {
              if (f.name === name && fs.existsSync(path.join(full, 'SKILL.md'))) return full;
              const found = walk(full);
              if (found) return found;
            }
          }
          return null;
        };
        return walk(SKILLS_DIR);
      };
      const skillDir = findSkillDir(args.name);
      if (!skillDir) return { content: [{ type: 'text', text: `Skill "${args.name}" not found.` }] };
      fs.rmSync(skillDir, { recursive: true });
      return { content: [{ type: 'text', text: `Skill "${args.name}" deleted.` }] };
    }

    return { content: [{ type: 'text', text: `Unknown tool: ${name}` }] };
  } catch (error) {
    return { content: [{ type: 'text', text: `Error: ${error.message}` }] };
  }
});

// ─── RESOURCES (AUTO-INJECTION) ──────────────────────────────
server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: [
    {
      uri: 'memory://current',
      name: 'Current Memory',
      description: 'All stored memories, auto-injected every turn.',
      mimeType: 'text/markdown',
    },
    {
      uri: 'memory://user',
      name: 'User Memory',
      description: 'User-specific memories (preferences, style, habits).',
      mimeType: 'text/markdown',
    },
    {
      uri: 'memory://project',
      name: 'Project Memory',
      description: 'Project-specific memories (environment, conventions, decisions).',
      mimeType: 'text/markdown',
    },
  ]
}));

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const uri = request.params.uri;
  if (uri === 'memory://current') {
    return { contents: [{ uri, mimeType: 'text/markdown', text: formatMemoriesForPrompt(getMemories()) }] };
  }
  if (uri === 'memory://user') {
    return { contents: [{ uri, mimeType: 'text/markdown', text: formatMemoriesForPrompt(getMemories('user')) }] };
  }
  if (uri === 'memory://project') {
    return { contents: [{ uri, mimeType: 'text/markdown', text: formatMemoriesForPrompt(getMemories('memory')) }] };
  }
  throw new Error(`Unknown resource: ${uri}`);
});

// ─── START ────────────────────────────────────────────────────
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('mem-evolved MCP server started');
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});
