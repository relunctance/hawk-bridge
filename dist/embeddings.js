// Embeddings module — handles vectorization
// Supports: OpenClaw (auto-config), Ollama (local free), Jina AI, Cohere, OpenAI
export class Embedder {
    config;
    openai;
    constructor(config) {
        this.config = config;
    }
    async embed(texts) {
        const { provider } = this.config;
        if (provider === 'minimax') {
            return this.embedMinimax(texts);
        }
        else if (provider === 'openclaw') {
            return this.embedOpenClaw(texts);
        }
        else if (provider === 'ollama') {
            return this.embedOllama(texts);
        }
        else if (provider === 'jina') {
            return this.embedJina(texts);
        }
        else if (provider === 'cohere') {
            return this.embedCohere(texts);
        }
        else {
            return this.embedOpenAI(texts);
        }
    }
    async embedQuery(text) {
        const vectors = await this.embed([text]);
        return vectors[0];
    }
    // ---- OpenClaw/Minimax: uses already-configured provider ----
    async embedOpenClaw(texts) {
        const baseURL = this.config.baseURL || 'https://api.minimaxi.com/v1';
        const apiKey = this.config.apiKey || process.env.MINIMAX_API_KEY || '';
        const resp = await fetch(`${baseURL}/embeddings`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: this.config.model || 'embedding-2-normal',
                type: 'db',
                texts: texts,
            }),
        });
        if (!resp.ok) {
            const errText = await resp.text();
            throw new Error(`OpenClaw/Minimax embedding error: ${resp.status} ${errText}`);
        }
        const data = await resp.json();
        if (!data.vectors || !data.vectors[0]) {
            throw new Error(`No vectors returned: ${JSON.stringify(data)}`);
        }
        return data.vectors;
    }
    // ---- OpenAI ----
    // ---- Minimax embeddings ----
    async embedMinimax(texts) {
        const baseURL = this.config.baseURL || 'https://api.minimaxi.com/v1';
        const apiKey = this.config.apiKey || process.env.MINIMAX_API_KEY || '';
        const resp = await fetch(`${baseURL}/embeddings`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: this.config.model || 'embedding-2-normal',
                type: 'db',
                texts: texts,
            }),
        });
        if (!resp.ok) {
            const errText = await resp.text();
            throw new Error(`Minimax embedding error: ${resp.status} ${errText}`);
        }
        const data = await resp.json();
        if (!data.vectors || !data.vectors[0]) {
            throw new Error(`No vectors returned: ${JSON.stringify(data)}`);
        }
        return data.vectors;
    }
    // ---- OpenAI ----
    async embedOpenAI(texts) {
        const { OpenAI } = await import('openai');
        const client = new OpenAI({ apiKey: this.config.apiKey || process.env.OPENAI_API_KEY });
        const model = this.config.model || 'text-embedding-3-small';
        const resp = await client.embeddings.create({ model, input: texts });
        return resp.data.map((item) => item.embedding);
    }
    // ---- Jina AI (free tier) ----
    async embedJina(texts) {
        const apiKey = this.config.apiKey || process.env.JINA_API_KEY || '';
        const model = this.config.model || 'jina-embeddings-v5-small';
        const resp = await fetch('https://api.jina.ai/v1/embeddings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}),
            },
            body: JSON.stringify({ model, input: texts }),
        });
        if (!resp.ok)
            throw new Error(`Jina error: ${resp.status}`);
        const data = await resp.json();
        return data.data.map((item) => item.embedding);
    }
    // ---- Cohere (free tier) ----
    async embedCohere(texts) {
        const apiKey = this.config.apiKey || process.env.COHERE_API_KEY || '';
        const resp = await fetch('https://api.cohere.ai/v1/embed', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: 'embed-english-v3.0',
                texts,
                input_type: 'search_document',
            }),
        });
        if (!resp.ok)
            throw new Error(`Cohere error: ${resp.status}`);
        const data = await resp.json();
        return data.embeddings;
    }
    // ---- Ollama (local free) ----
    async embedOllama(texts) {
        const baseURL = this.config.baseURL || 'http://localhost:11434';
        const model = this.config.model || 'nomic-embed-text';
        const results = [];
        for (const text of texts) {
            const resp = await fetch(`${baseURL}/api/embed`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model, input: text }),
            });
            if (!resp.ok)
                throw new Error(`Ollama error: ${resp.status}`);
            const data = await resp.json();
            results.push(data.embeddings);
        }
        return results;
    }
}
export function formatRecallForContext(memories, emoji = '🦅') {
    if (!memories.length)
        return '';
    const lines = [`${emoji} ** hawk 记忆检索结果 **`];
    for (const m of memories) {
        lines.push(`[${m.category}] (${(m.score * 100).toFixed(0)}%相关): ${m.text}`);
    }
    return lines.join('\n');
}
