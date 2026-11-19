import skillMarkdown from '@/lib/shine-film-mcp-skill.md?raw';
import type {McpServerVersion} from '@/lib/api-types';
import {SITE_URL} from '@/lib/meta';

const MCP_SERVER_VERSION: McpServerVersion = '0.1.0';
const MCP_URL = `${SITE_URL}/mcp`;
const SERVER_CARD_URL = `${SITE_URL}/mcp/server-card`;
const SERVER_CARD_TYPE = 'application/mcp-server-card+json';
const DEVELOPERS_URL = `${SITE_URL}/developers`;
const SKILL_NAME = 'shine-film-mcp';
const SKILL_PATH = `/.well-known/agent-skills/${SKILL_NAME}/SKILL.md`;

const serverCard = {
  $schema:
    'https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json',
  name: 'com.shine-film/shine-film',
  version: MCP_SERVER_VERSION,
  title: 'SHINE',
  description:
    'Read-only, best-effort film award data for Japan. Tool names and shapes may change without notice.',
  websiteUrl: DEVELOPERS_URL,
  repository: {
    url: 'https://github.com/dlwr/shine',
    source: 'github',
    subfolder: 'apps/api',
  },
  remotes: [{type: 'streamable-http', url: MCP_URL}],
};

const aiCatalog = {
  specVersion: '1.0',
  host: {displayName: 'SHINE', identifier: 'did:web:shine-film.com'},
  entries: [
    {
      identifier: 'urn:air:shine-film.com:mcp:shine-film',
      displayName: 'SHINE',
      type: SERVER_CARD_TYPE,
      url: SERVER_CARD_URL,
      representativeQueries: [
        'Which films won the Academy Award for Best Picture in 2000?',
        'Can I watch Parasite in Japan?',
        'カンヌのパルム・ドール受賞作で日本で観られる映画は',
      ],
    },
  ],
};

const apiCatalog = {
  linkset: [
    {
      anchor: MCP_URL,
      'service-desc': [{href: SERVER_CARD_URL, type: SERVER_CARD_TYPE}],
      'service-doc': [{href: DEVELOPERS_URL, type: 'text/html'}],
    },
  ],
};

const skillDescription = /\ndescription: (.+)\n/.exec(skillMarkdown)?.[1];

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(text),
  );
  return [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function skillsIndex() {
  return {
    $schema: 'https://schemas.agentskills.io/discovery/0.2.0/schema.json',
    skills: [
      {
        name: SKILL_NAME,
        type: 'skill-md',
        description: skillDescription,
        url: SKILL_PATH,
        digest: `sha256:${await sha256Hex(skillMarkdown)}`,
      },
    ],
  };
}

function publicResponse(body: string, contentType: string): Response {
  return new Response(body, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=3600',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET',
    },
  });
}

const JSON_TYPE = 'application/json; charset=utf-8';

const documents: Record<string, () => Promise<[string, string]>> = {
  '/mcp/server-card': async () => [
    JSON.stringify(serverCard),
    SERVER_CARD_TYPE,
  ],
  '/.well-known/mcp/server-card.json': async () => [
    JSON.stringify(serverCard),
    JSON_TYPE,
  ],
  '/.well-known/ai-catalog.json': async () => [
    JSON.stringify(aiCatalog),
    JSON_TYPE,
  ],
  '/.well-known/api-catalog': async () => [
    JSON.stringify(apiCatalog),
    'application/linkset+json; profile="https://www.rfc-editor.org/info/rfc9727"',
  ],
  '/.well-known/agent-skills/index.json': async () => [
    JSON.stringify(await skillsIndex()),
    JSON_TYPE,
  ],
  [SKILL_PATH]: async () => [skillMarkdown, 'text/markdown; charset=utf-8'],
};

export async function loader({request}: {request: Request}) {
  const document = documents[new URL(request.url).pathname];
  if (!document) {
    throw new Response('Not Found', {status: 404});
  }

  const [body, contentType] = await document();
  return publicResponse(body, contentType);
}
