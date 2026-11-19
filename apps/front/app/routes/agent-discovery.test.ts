// @vitest-environment node
import {describe, expect, it} from 'vitest';
import {loader} from './agent-discovery';

const SITE = 'https://shine-film.com';

type ServerCard = {
  $schema: string;
  name: string;
  version: string;
  description: string;
  websiteUrl: string;
  remotes: unknown[];
};

type SkillsIndex = {
  $schema: string;
  skills: Array<{
    name: string;
    description: string;
    url: string;
    digest: string;
  }>;
};

type AiCatalog = {
  specVersion: string;
  entries: Array<Record<string, unknown>>;
};

async function fetchPath(path: string): Promise<Response> {
  return loader({request: new Request(`${SITE}${path}`)});
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetchPath(path);
  return response.json() as Promise<T>;
}

async function fetchText(path: string): Promise<string> {
  const response = await fetchPath(path);
  return response.text();
}

async function sha256Of(path: string): Promise<string> {
  const response = await fetchPath(path);
  const digest = await crypto.subtle.digest(
    'SHA-256',
    await response.arrayBuffer(),
  );
  return [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

const serverCard = async () => fetchJson<ServerCard>('/mcp/server-card');
const skillsIndex = async () =>
  fetchJson<SkillsIndex>('/.well-known/agent-skills/index.json');
const firstSkillMarkdown = async () => {
  const {skills} = await skillsIndex();
  return fetchText(skills[0].url);
};

describe('MCP Server Card', () => {
  it.each(['/mcp/server-card', '/.well-known/mcp/server-card.json'])(
    '%s は現行仕様の schema を宣言する',
    async path => {
      const card = await fetchJson<ServerCard>(path);

      expect(card.$schema).toBe(
        'https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json',
      );
    },
  );

  it('仕様の位置では Server Card の media type で返す', async () => {
    const response = await fetchPath('/mcp/server-card');

    expect(response.headers.get('Content-Type')).toBe(
      'application/mcp-server-card+json',
    );
  });

  it('スキャナが見る古い位置では JSON として返す', async () => {
    const response = await fetchPath('/.well-known/mcp/server-card.json');

    expect(response.headers.get('Content-Type')).toBe(
      'application/json; charset=utf-8',
    );
  });

  it('どの origin からも読める', async () => {
    const response = await fetchPath('/mcp/server-card');

    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  it('名前は仕様の逆ドメイン形式にする', async () => {
    const card = await serverCard();

    expect(card.name).toMatch(/^[a-zA-Z\d.-]+\/[\w.-]+$/);
  });

  it('版は MCP サーバー本体の版と同じにする', async () => {
    const card = await serverCard();

    expect(card.version).toBe('0.1.0');
  });

  it('説明は仕様の上限の 100 文字に収める', async () => {
    const card = await serverCard();

    expect(card.description.length).toBeLessThanOrEqual(100);
  });

  it('説明で読み取り専用・ベストエフォートで予告なく変わることを伝える', async () => {
    const {description} = await serverCard();

    expect(description).toMatch(/read-only/i);
    expect(description).toMatch(/best-effort/i);
    expect(description).toMatch(/without notice/i);
  });

  it('接続先に Streamable HTTP の URL を載せる', async () => {
    const card = await serverCard();

    expect(card.remotes).toEqual([
      {type: 'streamable-http', url: `${SITE}/mcp`},
    ]);
  });

  it('案内ページを websiteUrl にする', async () => {
    const card = await serverCard();

    expect(card.websiteUrl).toBe(`${SITE}/developers`);
  });
});

describe('Agent Skills の index', () => {
  it('discovery 0.2.0 の schema を宣言する', async () => {
    const index = await skillsIndex();

    expect(index.$schema).toBe(
      'https://schemas.agentskills.io/discovery/0.2.0/schema.json',
    );
  });

  it('どの origin からも読める', async () => {
    const response = await fetchPath('/.well-known/agent-skills/index.json');

    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  it('各 Skill の digest は配っている SKILL.md の SHA-256 と一致する', async () => {
    const {skills} = await skillsIndex();

    for (const skill of skills) {
      expect(skill.digest).toBe(`sha256:${await sha256Of(skill.url)}`);
    }
  });

  it('各 Skill の説明は SKILL.md の frontmatter の説明と同じにする', async () => {
    const {skills} = await skillsIndex();

    for (const skill of skills) {
      expect(await fetchText(skill.url)).toContain(
        `\ndescription: ${skill.description}\n`,
      );
    }
  });

  it('各 Skill の名前は SKILL.md の frontmatter の名前と同じにする', async () => {
    const {skills} = await skillsIndex();

    for (const skill of skills) {
      expect(await fetchText(skill.url)).toMatch(
        new RegExp(String.raw`^---\nname: ${skill.name}\n`),
      );
    }
  });

  it('SKILL.md は Markdown として返す', async () => {
    const {skills} = await skillsIndex();
    const response = await fetchPath(skills[0].url);

    expect(response.headers.get('Content-Type')).toBe(
      'text/markdown; charset=utf-8',
    );
  });

  it.each(['search_movies', 'get_movie', 'list_awards', 'get_award_year'])(
    'SKILL.md はツール %s を説明する',
    async tool => {
      expect(await firstSkillMarkdown()).toContain(`\`${tool}\``);
    },
  );

  it.each(['watchable', 'rental_only', 'unwatchable', 'unchecked'])(
    'SKILL.md は日本で観られるかの値 %s を説明する',
    async status => {
      expect(await firstSkillMarkdown()).toContain(`\`${status}\``);
    },
  );
});

describe('API Catalog', () => {
  const catalogPath = '/.well-known/api-catalog';

  it('linkset+json で返す', async () => {
    const response = await fetchPath(catalogPath);

    expect(response.headers.get('Content-Type')).toMatch(
      /^application\/linkset\+json/,
    );
  });

  it('MCP の endpoint を anchor にして Server Card と案内ページを指す', async () => {
    const catalog = await fetchJson<{linkset: unknown[]}>(catalogPath);

    expect(catalog.linkset).toEqual([
      {
        anchor: `${SITE}/mcp`,
        'service-desc': [
          {
            href: `${SITE}/mcp/server-card`,
            type: 'application/mcp-server-card+json',
          },
        ],
        'service-doc': [{href: `${SITE}/developers`, type: 'text/html'}],
      },
    ]);
  });
});

describe('AI Catalog', () => {
  const catalogPath = '/.well-known/ai-catalog.json';

  it('specVersion を宣言する', async () => {
    const catalog = await fetchJson<AiCatalog>(catalogPath);

    expect(catalog.specVersion).toBe('1.0');
  });

  it('どの origin からも読める', async () => {
    const response = await fetchPath(catalogPath);

    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  it('Server Card を url で指す', async () => {
    const {entries} = await fetchJson<AiCatalog>(catalogPath);

    expect(entries[0]).toMatchObject({
      identifier: 'urn:air:shine-film.com:mcp:shine-film',
      type: 'application/mcp-server-card+json',
      url: `${SITE}/mcp/server-card`,
    });
  });

  it('項目は url と data のどちらか一方だけを持つ', async () => {
    const {entries} = await fetchJson<AiCatalog>(catalogPath);

    for (const entry of entries) {
      expect('url' in entry !== 'data' in entry).toBe(true);
    }
  });
});
