import type { Icon, ICredentialTestRequest, ICredentialType, INodeProperties } from 'n8n-workflow';

export class AzureCohereRerankApi implements ICredentialType {
	name = 'azureCohereRerankApi';

	displayName = 'Azure Cohere Rerank API';

	icon: Icon = {
		light: 'file:../icons/azureCohere.svg',
		dark: 'file:../icons/azureCohere.dark.svg',
	};

	testedBy = ['azureCohereRerank'];

	test: ICredentialTestRequest = {
		request: {
			method: 'GET',
			url: '={{ $credentials.endpointUrl }}',
		},
	};

	documentationUrl = 'https://docs.cohere.com/docs/cohere-on-azure/azure-ai-reranking';

	properties: INodeProperties[] = [
		{
			displayName: 'Endpoint URL',
			name: 'endpointUrl',
			type: 'string',
			default: '',
			description: 'Full Azure endpoint including /v1/rerank',
			placeholder: 'https://<deployment>.<region>.models.ai.azure.com/v1/rerank',
			required: true,
		},
		{
			displayName: 'Authentication',
			name: 'authType',
			type: 'options',
			default: 'apiKey',
			options: [
				{
					name: 'API Key (api-key header)',
					value: 'apiKey',
				},
				{
					name: 'Bearer Token (Authorization header)',
					value: 'bearer',
				},
			],
		},
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			displayOptions: {
				show: {
					authType: ['apiKey'],
				},
			},
			required: true,
		},
		{
			displayName: 'Bearer Token',
			name: 'bearerToken',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			displayOptions: {
				show: {
					authType: ['bearer'],
				},
			},
			required: true,
		},
	];
}
