<script lang="ts">
	interface StepRangeOption {
		readonly value: number;
		readonly label: string;
	}

	interface Props {
		readonly id: string;
		readonly label: string;
		readonly value: number;
		readonly options: readonly StepRangeOption[];
		readonly valueLabel: string;
		readonly onValueChange: (nextValue: number) => void;
	}

	const { id, label, value, options, valueLabel, onValueChange }: Props = $props();

	let minValue = $derived(options[0]?.value ?? value);
	let maxValue = $derived(options[options.length - 1]?.value ?? minValue);
	let stepValue = $derived(resolveStepValue(options));
	let rangeProgressPercent = $derived(resolveRangeProgressPercent(value, minValue, maxValue));

	function handleInput(event: Event) {
		const target = event.currentTarget;

		if (!(target instanceof HTMLInputElement)) {
			return;
		}

		onValueChange(Number(target.value));
	}

	function resolveStepValue(stepOptions: readonly StepRangeOption[]) {
		const firstOption = stepOptions[0];
		const secondOption = stepOptions[1];

		if (firstOption === undefined || secondOption === undefined) {
			return 1;
		}

		return Math.abs(secondOption.value - firstOption.value);
	}

	function resolveRangeProgressPercent(currentValue: number, min: number, max: number) {
		if (max === min) {
			return 0;
		}

		return ((currentValue - min) / (max - min)) * 100;
	}
</script>

<label class="workduck-step-range-field" for={id}>
	<span class="workduck-step-range-header">
		<span class="workduck-step-range-label">{label}</span>
		<output class="workduck-step-range-value" for={id}>{valueLabel}</output>
	</span>

	<span class="workduck-step-range-control">
		<input
			id={id}
			class="workduck-range-input"
			type="range"
			min={minValue}
			max={maxValue}
			step={stepValue}
			value={value}
			aria-valuetext={valueLabel}
			style={`--workduck-step-range-progress: ${rangeProgressPercent}%;`}
			oninput={handleInput}
		/>
		<span class="workduck-step-range-ticks" aria-hidden="true">
			{#each options as option}
				<span
					class={option.value === value
						? 'workduck-step-range-tick workduck-step-range-tick-active'
						: 'workduck-step-range-tick'}
					style={`--workduck-step-range-tick-position: ${resolveRangeProgressPercent(option.value, minValue, maxValue)}%;`}
				>
					{option.label}
				</span>
			{/each}
		</span>
	</span>
</label>
