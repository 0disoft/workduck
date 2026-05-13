export interface WorkduckAppOperation {
	readonly id: number;
	readonly label: string;
	readonly detail: string;
}

interface WorkduckAppOperationInput {
	readonly label: string;
	readonly detail?: string;
}

type WorkduckAppOperationSubscriber = (operation: WorkduckAppOperation | null) => void;

let activeOperation: WorkduckAppOperation | null = null;
let nextOperationId = 1;

const subscribers = new Set<WorkduckAppOperationSubscriber>();

export function subscribeAppOperation(subscriber: WorkduckAppOperationSubscriber) {
	subscriber(activeOperation);
	subscribers.add(subscriber);

	return () => {
		subscribers.delete(subscriber);
	};
}

export function startAppOperation(input: WorkduckAppOperationInput) {
	const operation: WorkduckAppOperation = {
		id: nextOperationId,
		label: input.label,
		detail: input.detail ?? ''
	};

	nextOperationId += 1;
	setActiveOperation(operation);

	return {
		finish() {
			if (activeOperation?.id !== operation.id) {
				return;
			}

			setActiveOperation(null);
		}
	};
}

function setActiveOperation(operation: WorkduckAppOperation | null) {
	activeOperation = operation;

	for (const subscriber of subscribers) {
		subscriber(operation);
	}
}
