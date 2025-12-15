![Azure Cohere Rerank banner](https://user-images.githubusercontent.com/10284570/173569848-c624317f-42b1-45a6-ab09-f0ea3c247648.png)

# n8n-nodes-azure-cohere-rerank

An n8n community node that exposes Azure-hosted Cohere **Rerank** as an **AI Reranker** connection for n8n’s interactive AI/LangChain-style pipelines. The node mirrors the built-in Cohere reranker defaults while swapping transport/auth to Azure AI Foundry (`/v1/rerank`).

## Features
- Outputs `AiReranker` so it plugs into n8n AI chains.
- Supports Azure AI Foundry Cohere Rerank endpoints (e.g. `https://<deployment>.<region>.models.ai.azure.com/v1/rerank`).
- Authentication:
  - Built-in **httpBearerAuth** credential (recommended).
  - Built-in **httpHeaderAuth** (api-key header).
  - Custom **Azure Cohere Rerank API** credential (api-key or bearer).
- Configurable Model (`rerank-v3.5` default) and Top N (`3` default).
- Attaches `relevance_score` to document metadata and preserves original docs.

## Installation
```bash
npm install n8n-nodes-azure-cohere-rerank
```
Restart n8n after installing the package.

## Configuration
1. **Endpoint URL**: Full Azure endpoint including `/v1/rerank`, e.g.  
   `https://<deployment>.<region>.models.ai.azure.com/v1/rerank`
2. **Authentication (choose one)**:
   - **Use Existing Bearer Token (httpBearerAuth)**: Select an existing bearer credential; the node sends `Authorization: Bearer <token>`.
   - **Use Existing API Key Header (httpHeaderAuth)**: Select an existing header credential; ensure the header name is `api-key`.
   - **Use Azure Cohere Rerank Credential**: Custom credential with `authType` = `apiKey` (`api-key` header) or `bearer` (`Authorization: Bearer <token>`), plus the endpoint URL.
3. **Model**: Defaults to `rerank-v3.5` (options include `rerank-english-v3.0`, `rerank-multilingual-v3.0`, `rerank-4.0`).
4. **Top N**: Defaults to `3`; limits the number of returned documents.

## Example (minimal)
1. Add an **HTTP Request** or retrieval node that produces documents (as strings or `{ pageContent, metadata }`).
2. Add **Azure Cohere Rerank** and configure the endpoint, authentication, model, and Top N.
3. Connect the reranker output to downstream AI nodes (e.g., a chat model that consumes `AiReranker`).

The reranker POSTs:
```json
{
  "query": "<your query>",
  "documents": ["doc text 1", "doc text 2"],
  "top_n": 3,
  "model": "rerank-v3.5"
}
```
and returns results with `index` and `relevance_score`; the node reorders your documents and stores the score in `metadata.relevance_score`.

## API contract research (Azure Cohere Rerank)
- **Endpoint**: `POST https://<deployment>.<region>.models.ai.azure.com/v1/rerank` (Azure AI Foundry)  
- **Request fields** (per Cohere on Azure docs): `query` (string), `documents` (array of strings or objects), optional `top_n`, optional `return_documents`, optional chunk controls.  
- **Response**: `{ id, results: [{ index, relevance_score, document? }, ...] }` ordered by relevance.  
- **Authentication**: Azure issues keys usable as either `api-key: <key>` or `Authorization: Bearer <token>` headers.  
Sources: [Cohere on Azure Reranking](https://docs.cohere.com/docs/cohere-on-azure/azure-ai-reranking), [Cohere on Microsoft Azure](https://docs.cohere.com/docs/cohere-on-microsoft-azure), Azure AI Model Catalog pages.

## Development
```bash
npm test          # unit tests
npm run lint      # linting (from @n8n/node-cli)
npm run build     # compile to dist
npm pack          # produce publishable tarball
```

## License
MIT
