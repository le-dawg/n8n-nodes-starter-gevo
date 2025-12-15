import {
	ApplicationError,
	NodeConnectionTypes,
	NodeOperationError,
	type IHttpRequestOptions,
	type INodeType,
	type INodeTypeDescription,
	type ISupplyDataFunctions,
	type SupplyData,
} from 'n8n-workflow';

type DocumentInput =
	| string
	| {
			pageContent?: string;
			metadata?: Record<string, unknown>;
			[key: string]: unknown;
	  };

type RerankRequestFunction = (options: IHttpRequestOptions) => Promise<AzureRerankResponse>;

interface AzureRerankOptions {
	endpointUrl: string;
	headers?: Record<string, string>;
	modelName: string;
	topN: number;
	request: RerankRequestFunction;
	logger?: ISupplyDataFunctions['logger'];
}

interface AzureRerankResult {
	index: number;
	relevance_score: number;
	document?: unknown;
}

interface AzureRerankResponse {
	id?: string;
	results?: AzureRerankResult[];
}

class AzureCohereReranker {
	constructor(private readonly options: AzureRerankOptions) {}

	async compressDocuments(documents: DocumentInput[], query: string) {
		const { endpointUrl, headers = {}, topN, modelName, request, logger } = this.options;

		if (!documents || documents.length === 0) {
			return [];
		}

		const normalizedDocuments = documents.map((doc) => {
			if (typeof doc === 'string') return doc;
			if (doc.pageContent) return doc.pageContent;
			return JSON.stringify(doc);
		});

		const body = {
			query,
			documents: normalizedDocuments,
			top_n: topN,
			model: modelName,
		};

		let response: AzureRerankResponse;
		try {
			response = await request({
				method: 'POST',
				url: endpointUrl,
				body,
				headers: {
					'Content-Type': 'application/json',
					...headers,
				},
			});
		} catch (error: unknown) {
			const status =
				(error as { statusCode?: number; status?: number })?.statusCode ??
				(error as { status?: number })?.status ??
				'';
			const message = (error as { message?: string })?.message ?? 'Unknown error';
			logger?.error?.(`Azure Cohere Rerank request failed: ${message}`);
			throw new ApplicationError(
				`Azure Cohere Rerank request failed${status ? ` (${status})` : ''}: ${message}`,
			);
		}

		if (!response?.results || !Array.isArray(response.results)) {
			throw new ApplicationError(
				'Unexpected response shape from Azure Cohere Rerank (missing results)',
			);
		}

		return response.results.slice(0, topN).map((result) => {
			if (typeof result.index !== 'number') {
				throw new ApplicationError(
					'Unexpected response shape from Azure Cohere Rerank (missing index)',
				);
			}

			const original = documents[result.index];
			if (original === undefined) {
				throw new ApplicationError(
					`Received index ${result.index} not present in provided documents`,
				);
			}

			const base =
				typeof original === 'string'
					? { pageContent: original, metadata: {} as Record<string, unknown> }
					: {
							...original,
							metadata: {
								...(original.metadata ?? {}),
							},
					  };

			return {
				...base,
				metadata: {
					...base.metadata,
					relevance_score: result.relevance_score,
				},
			};
		});
	}
}

const logWrapper = <T extends object>(target: T, context: ISupplyDataFunctions): T =>
	new Proxy(target, {
		get(obj, prop, receiver) {
			const value = Reflect.get(obj, prop, receiver);
			if (typeof value !== 'function') return value;
			return (...args: unknown[]) => {
				context.logger?.debug?.(`AzureCohereRerank.${String(prop)}`);
				return (value as (...innerArgs: unknown[]) => unknown).apply(obj, args);
			};
		},
	});

export class AzureCohereRerank implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Azure Cohere Rerank',
		name: 'azureCohereRerank',
		icon: {
			light: 'file:../../icons/azureCohere.svg',
			dark: 'file:../../icons/azureCohere.dark.svg',
		},
		group: ['transform'],
		version: 1,
		description:
			'Use Cohere Rerank hosted on Azure AI Foundry to reorder documents by relevance to a query',
		defaults: {
			name: 'Azure Cohere Rerank',
		},
		usableAsTool: true,
		inputs: [],
		outputs: [NodeConnectionTypes.AiReranker],
		outputNames: ['Reranker'],
		credentials: [
			{
				name: 'azureCohereRerankApi',
				required: true,
				displayOptions: {
					show: {
						authentication: ['azureCredential'],
					},
				},
			},
			{
				// Reuse existing bearer credentials so users can select stored tokens without duplicating secrets.
				// The base rule is disabled here because the credential type name must stay aligned with n8n's built-in httpBearerAuth.
				// eslint-disable-next-line @n8n/community-nodes/no-credential-reuse, n8n-nodes-base/node-class-description-credentials-name-unsuffixed
				name: 'httpBearerAuth',
				required: true,
				displayOptions: {
					show: {
						authentication: ['httpBearer'],
					},
				},
			},
			{
				// Reuse existing API key header credentials (httpHeaderAuth) to avoid re-entering secrets.
				// eslint-disable-next-line @n8n/community-nodes/no-credential-reuse
				name: 'httpHeaderAuth',
				required: true,
				displayOptions: {
					show: {
						authentication: ['httpHeader'],
					},
				},
			},
		],
		codex: {
			categories: ['AI'],
			subcategories: {
				AI: ['Rerankers'],
			},
			resources: {
				primaryDocumentation: [
					{
						url: 'https://docs.cohere.com/docs/cohere-on-azure/azure-ai-reranking',
					},
				],
			},
		},
		properties: [
			{
				displayName: 'Authentication',
				name: 'authentication',
				type: 'options',
				options: [
					{
						name: 'Use Azure Cohere Rerank Credential',
						value: 'azureCredential',
					},
					{
						name: 'Use Existing Bearer Token (httpBearerAuth)',
						value: 'httpBearer',
					},
					{
						name: 'Use Existing API Key Header (httpHeaderAuth)',
						value: 'httpHeader',
					},
				],
				default: 'httpBearer',
			},
			{
				displayName: 'Endpoint URL',
				name: 'endpointUrl',
				type: 'string',
				default: '',
				description: 'Full Azure endpoint including /v1/rerank',
				placeholder: 'https://<deployment>.<region>.models.ai.azure.com/v1/rerank',
			},
			{
				displayName: 'Model',
				name: 'modelName',
				type: 'options',
				description:
					'The model that should be used to rerank the documents. <a href="https://ai.azure.com/catalog/models/Cohere-rerank-v3.5" target="_blank">Learn more</a>.',
				default: 'rerank-v3.5',
				options: [
					{
						name: 'rerank-v3.5',
						value: 'rerank-v3.5',
					},
					{
						name: 'rerank-english-v3.0',
						value: 'rerank-english-v3.0',
					},
					{
						name: 'rerank-multilingual-v3.0',
						value: 'rerank-multilingual-v3.0',
					},
				],
			},
			{
				displayName: 'Top N',
				name: 'topN',
				type: 'number',
				description: 'The maximum number of documents to return after reranking',
				default: 3,
			},
		],
	};

	async supplyData(this: ISupplyDataFunctions, itemIndex: number): Promise<SupplyData> {
		this.logger.debug('Supply data for Azure Cohere Rerank');
		const authentication = this.getNodeParameter('authentication', itemIndex, 'httpBearer') as string;
		const endpointUrlParam = this.getNodeParameter('endpointUrl', itemIndex, '') as string;
		const modelName = this.getNodeParameter('modelName', itemIndex, 'rerank-v3.5') as string;
		const topN = this.getNodeParameter('topN', itemIndex, 3) as number;

		let endpointUrl = endpointUrlParam;
		const headers: Record<string, string> = {};
		let request: RerankRequestFunction;

		const assertEndpoint = () => {
			if (!endpointUrl) {
				throw new NodeOperationError(this.getNode(), 'Endpoint URL is required', {
					itemIndex,
				});
			}
		};

		if (authentication === 'azureCredential') {
			const credentials = await this.getCredentials<{
				endpointUrl: string;
				authType: 'apiKey' | 'bearer';
				apiKey?: string;
				bearerToken?: string;
			}>('azureCohereRerankApi');
			endpointUrl = endpointUrl || credentials.endpointUrl;
			assertEndpoint();

			if (credentials.authType === 'apiKey') {
				if (!credentials.apiKey) {
					throw new NodeOperationError(
						this.getNode(),
						'API key is required for Azure Cohere Rerank authentication',
						{ itemIndex },
					);
				}
				headers['api-key'] = credentials.apiKey as string;
			} else {
				if (!credentials.bearerToken) {
					throw new NodeOperationError(
						this.getNode(),
						'Bearer token is required for Azure Cohere Rerank authentication',
						{ itemIndex },
					);
				}
				headers.Authorization = `Bearer ${credentials.bearerToken}`;
			}

			request = (options) =>
				this.helpers.httpRequest({
					...options,
					url: endpointUrl,
					headers: {
						'Content-Type': 'application/json',
						...headers,
						...(options.headers ?? {}),
					},
				});
		} else if (authentication === 'httpBearer') {
			assertEndpoint();
			request = (options) =>
				this.helpers.httpRequestWithAuthentication.call(this, 'httpBearerAuth', {
					...options,
					url: endpointUrl,
					headers: {
						'Content-Type': 'application/json',
						...(options.headers ?? {}),
					},
				});
		} else if (authentication === 'httpHeader') {
			const credentials = await this.getCredentials<{ name?: string; value?: string }>(
				'httpHeaderAuth',
			);
			assertEndpoint();

			const headerName = credentials?.name || 'api-key';
			const headerValue = credentials?.value;
			if (!headerValue) {
				throw new NodeOperationError(
					this.getNode(),
					'API key value is required in httpHeaderAuth credentials',
					{ itemIndex },
				);
			}

			headers[headerName] = headerValue as string;

			request = (options) =>
				this.helpers.httpRequest({
					...options,
					url: endpointUrl,
					headers: {
						'Content-Type': 'application/json',
						...headers,
						...(options.headers ?? {}),
					},
				});
		} else {
			throw new NodeOperationError(this.getNode(), 'Unsupported authentication mode', {
				itemIndex,
			});
		}

		const reranker = new AzureCohereReranker({
			endpointUrl,
			headers,
			modelName,
			topN,
			request,
			logger: this.logger,
		});

		return {
			response: logWrapper(reranker, this),
		};
	}
}
