import adapter from '@sveltejs/adapter-static';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	compilerOptions: {
		runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
	},
	kit: {
		alias: {
			'@workduck/core': './packages/core/src/index.ts',
			'@workduck/schemas': './packages/schemas/src/index.ts',
			'@workduck/prompts': './packages/prompts/src/index.ts',
			'@workduck/agents': './packages/agents/src/index.ts',
			'@workduck/workbench-engine': './packages/workbench-engine/src/index.ts'
		},
		adapter: adapter({
			fallback: 'index.html'
		})
	}
};

export default config;
