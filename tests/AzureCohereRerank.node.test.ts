import { AzureCohereRerank } from '../nodes/AzureCohereRerank/AzureCohereRerank.node';

import type { ISupplyDataFunctions } from 'n8n-workflow';

type TestDocument = { pageContent: string; metadata?: Record<string, unknown> } | string;
type RerankedDocument = { pageContent: string; metadata: Record<string, unknown> };
type WrappedReranker = { compressDocuments: (documents: TestDocument[], query: string) => Promise<RerankedDocument[]> };

const createContext = () => {
	const httpRequest = jest.fn();
	const httpRequestWithAuthentication = jest.fn();

	const context = {
		getNodeParameter: jest.fn(),
		getCredentials: jest.fn(),
		helpers: {
			httpRequest,
			httpRequestWithAuthentication,
		},
		logger: {
			debug: jest.fn(),
			error: jest.fn(),
			info: jest.fn(),
			warn: jest.fn(),
		},
	} as unknown as ISupplyDataFunctions;

	return { context, httpRequest, httpRequestWithAuthentication };
};

describe('AzureCohereRerank node', () => {
	let node: AzureCohereRerank;

	beforeEach(() => {
		node = new AzureCohereRerank();
	});

	it('exposes httpBearerAuth credential', () => {
		const credentialNames = node.description.credentials?.map((c) => c.name);
		expect(credentialNames).toContain('httpBearerAuth');
	});

	it('uses defaults for model and topN', async () => {
		const { context, httpRequest } = createContext();
		(context.getNodeParameter as jest.Mock)
			.mockReturnValueOnce('azureCredential') // authentication
			.mockReturnValueOnce('') // endpointUrl
			.mockReturnValueOnce('rerank-v3.5') // model
			.mockReturnValueOnce(3); // topN

		(context.getCredentials as jest.Mock).mockResolvedValue({
			endpointUrl: 'https://example.eastus.models.ai.azure.com/v1/rerank',
			authType: 'apiKey',
			apiKey: 'abc',
		});

		httpRequest.mockResolvedValue({
			results: [
				{ index: 0, relevance_score: 0.9 },
				{ index: 1, relevance_score: 0.2 },
			],
		});

		const { response } = (await node.supplyData.call(context, 0)) as unknown as {
			response: WrappedReranker;
		};
		expect(context.getNodeParameter).toHaveBeenCalledWith('modelName', 0, 'rerank-v3.5');
		expect(context.getNodeParameter).toHaveBeenCalledWith('topN', 0, 3);

		const docs = [
			{ pageContent: 'first', metadata: { id: 1 } },
			{ pageContent: 'second', metadata: { id: 2 } },
		];
		const reranked = await response.compressDocuments(docs, 'question');

		expect(httpRequest).toHaveBeenCalledWith(
			expect.objectContaining({
				url: 'https://example.eastus.models.ai.azure.com/v1/rerank',
				body: expect.objectContaining({
					query: 'question',
					top_n: 3,
					model: 'rerank-v3.5',
				}),
			}),
		);
		expect(reranked[0].metadata.relevance_score).toBe(0.9);
		expect(reranked[1].metadata.relevance_score).toBe(0.2);
	});

	it('attaches api-key header when using custom credential', async () => {
		const { context, httpRequest } = createContext();
		(context.getNodeParameter as jest.Mock)
			.mockReturnValueOnce('azureCredential')
			.mockReturnValueOnce('')
			.mockReturnValueOnce('rerank-v3.5')
			.mockReturnValueOnce(3);

		(context.getCredentials as jest.Mock).mockResolvedValue({
			endpointUrl: 'https://endpoint/models/v1/rerank',
			authType: 'apiKey',
			apiKey: 'secret-key',
		});

		httpRequest.mockResolvedValue({
			results: [
				{ index: 1, relevance_score: 0.7 },
				{ index: 0, relevance_score: 0.3 },
			],
		});

		const { response } = (await node.supplyData.call(context, 1)) as unknown as {
			response: WrappedReranker;
		};
		const docs = [{ pageContent: 'alpha' }, { pageContent: 'beta' }];
		await response.compressDocuments(docs, 'hello');

		expect(httpRequest).toHaveBeenCalledWith(
			expect.objectContaining({
				headers: expect.objectContaining({ 'api-key': 'secret-key' }),
				body: expect.objectContaining({
					documents: ['alpha', 'beta'],
					top_n: 3,
				}),
			}),
		);
	});

	it('uses httpBearerAuth when configured', async () => {
		const { context, httpRequestWithAuthentication } = createContext();
		(context.getNodeParameter as jest.Mock)
			.mockReturnValueOnce('httpBearer')
			.mockReturnValueOnce('https://endpoint/v1/rerank')
			.mockReturnValueOnce('rerank-v3.5')
			.mockReturnValueOnce(2);

		httpRequestWithAuthentication.mockResolvedValue({
			results: [
				{ index: 0, relevance_score: 0.6 },
				{ index: 1, relevance_score: 0.4 },
				{ index: 2, relevance_score: 0.2 },
			],
		});

		const { response } = (await node.supplyData.call(context, 0)) as unknown as {
			response: WrappedReranker;
		};
		const docs = ['doc1', 'doc2', 'doc3'];
		const result = await response.compressDocuments(docs, 'query');

		expect(httpRequestWithAuthentication).toHaveBeenCalledWith(
			'httpBearerAuth',
			expect.objectContaining({
				url: 'https://endpoint/v1/rerank',
				body: expect.objectContaining({ top_n: 2 }),
			}),
		);
		expect(result).toHaveLength(2);
		expect(result[0].pageContent).toBe('doc1');
		expect(result[0].metadata.relevance_score).toBe(0.6);
	});

	it('supports httpHeaderAuth for API key', async () => {
		const { context, httpRequest } = createContext();
		(context.getNodeParameter as jest.Mock)
			.mockReturnValueOnce('httpHeader')
			.mockReturnValueOnce('https://endpoint/v1/rerank')
			.mockReturnValueOnce('rerank-v3.5')
			.mockReturnValueOnce(2);

		(context.getCredentials as jest.Mock).mockResolvedValue({
			name: 'api-key',
			value: 'header-key',
		});

		httpRequest.mockResolvedValue({
			results: [
				{ index: 1, relevance_score: 0.9 },
				{ index: 0, relevance_score: 0.1 },
			],
		});

		const { response } = (await node.supplyData.call(context, 0)) as unknown as {
			response: WrappedReranker;
		};
		const docs = [{ pageContent: 'first' }, { pageContent: 'second' }];
		const output = await response.compressDocuments(docs, 'find');

		expect(httpRequest).toHaveBeenCalledWith(
			expect.objectContaining({
				headers: expect.objectContaining({ 'api-key': 'header-key' }),
			}),
		);
		expect(output[0].pageContent).toBe('second');
		expect(output[0].metadata.relevance_score).toBe(0.9);
	});

	it('throws when credentials are missing', async () => {
		const { context } = createContext();
		(context.getNodeParameter as jest.Mock)
			.mockReturnValueOnce('azureCredential')
			.mockReturnValueOnce('')
			.mockReturnValueOnce('rerank-v3.5')
			.mockReturnValueOnce(3);

		(context.getCredentials as jest.Mock).mockRejectedValue(new Error('Missing credentials'));

		await expect(node.supplyData.call(context, 0)).rejects.toThrow('Missing credentials');
	});

	it('bubbles request errors with status code', async () => {
		const { context, httpRequest } = createContext();
		(context.getNodeParameter as jest.Mock)
			.mockReturnValueOnce('azureCredential')
			.mockReturnValueOnce('https://endpoint/v1/rerank')
			.mockReturnValueOnce('rerank-v3.5')
			.mockReturnValueOnce(3);

		(context.getCredentials as jest.Mock).mockResolvedValue({
			endpointUrl: 'https://endpoint/v1/rerank',
			authType: 'apiKey',
			apiKey: 'secret-key',
		});

		const httpError = Object.assign(new Error('Unauthorized'), { statusCode: 401 });
		httpRequest.mockRejectedValue(httpError);

		const { response } = (await node.supplyData.call(context, 0)) as unknown as {
			response: WrappedReranker;
		};
		await expect(response.compressDocuments([{ pageContent: 'a' }], 'q')).rejects.toThrow('401');
	});

	it('throws on unexpected response shape', async () => {
		const { context, httpRequest } = createContext();
		(context.getNodeParameter as jest.Mock)
			.mockReturnValueOnce('azureCredential')
			.mockReturnValueOnce('https://endpoint/v1/rerank')
			.mockReturnValueOnce('rerank-v3.5')
			.mockReturnValueOnce(3);

		(context.getCredentials as jest.Mock).mockResolvedValue({
			endpointUrl: 'https://endpoint/v1/rerank',
			authType: 'apiKey',
			apiKey: 'secret-key',
		});

		httpRequest.mockResolvedValue({});

		const { response } = (await node.supplyData.call(context, 0)) as unknown as {
			response: WrappedReranker;
		};
		await expect(response.compressDocuments([{ pageContent: 'a' }], 'query')).rejects.toThrow(
			'Unexpected response shape',
		);
	});

	it('returns empty array without calling service when documents are empty', async () => {
		const { context, httpRequest } = createContext();
		(context.getNodeParameter as jest.Mock)
			.mockReturnValueOnce('azureCredential')
			.mockReturnValueOnce('https://endpoint/v1/rerank')
			.mockReturnValueOnce('rerank-v3.5')
			.mockReturnValueOnce(3);

		(context.getCredentials as jest.Mock).mockResolvedValue({
			endpointUrl: 'https://endpoint/v1/rerank',
			authType: 'bearer',
			bearerToken: 'token',
		});

		const { response } = (await node.supplyData.call(context, 0)) as unknown as {
			response: WrappedReranker;
		};
		const result = await response.compressDocuments([], 'query');
		expect(result).toEqual([]);
		expect(httpRequest).not.toHaveBeenCalled();
	});
});
