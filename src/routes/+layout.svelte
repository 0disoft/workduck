<script lang="ts">
	import '../app.css';

	let { children } = $props();
</script>

<nav class="flex h-[3.25rem] items-center gap-1 border-b border-[#d8ddd4] px-4">
	<a class="px-3 py-2 text-sm text-[#20211f] hover:bg-[#ebeee8]" href="/">Projects</a>
	<a class="px-3 py-2 text-sm text-[#20211f] hover:bg-[#ebeee8]" href="/artifacts">Artifacts</a>
</nav>

{@render children()}
