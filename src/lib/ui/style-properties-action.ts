export type StylePropertyValue = number | string | null | undefined;
export type StyleProperties = Readonly<Record<string, StylePropertyValue>>;

function applyStyleProperties(
	node: HTMLElement,
	nextProperties: StyleProperties,
	appliedPropertyNames: Set<string>
) {
	for (const propertyName of appliedPropertyNames) {
		if (!(propertyName in nextProperties)) {
			node.style.removeProperty(propertyName);
			appliedPropertyNames.delete(propertyName);
		}
	}

	for (const [propertyName, value] of Object.entries(nextProperties)) {
		if (value === null || value === undefined) {
			node.style.removeProperty(propertyName);
			appliedPropertyNames.delete(propertyName);
			continue;
		}

		node.style.setProperty(propertyName, String(value));
		appliedPropertyNames.add(propertyName);
	}
}

export function styleProperties(node: HTMLElement, properties: StyleProperties = {}) {
	const appliedPropertyNames = new Set<string>();

	applyStyleProperties(node, properties, appliedPropertyNames);

	return {
		update(nextProperties: StyleProperties = {}) {
			applyStyleProperties(node, nextProperties, appliedPropertyNames);
		},
		destroy() {
			for (const propertyName of appliedPropertyNames) {
				node.style.removeProperty(propertyName);
			}

			appliedPropertyNames.clear();
		}
	};
}
