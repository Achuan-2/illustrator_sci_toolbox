<script lang="ts">
  import type { SwapAnchor } from '../../shared/host';

  let { anchor }: { anchor: SwapAnchor } = $props();
  // Normalized anchor positions apply to both objects, even at different sizes.
  const positions: Record<SwapAnchor, [number, number]> = {
    TL: [0, 0],
    TC: [0.5, 0],
    TR: [1, 0],
    LC: [0, 0.5],
    C: [0.5, 0.5],
    RC: [1, 0.5],
    BL: [0, 1],
    BC: [0.5, 1],
    BR: [1, 1]
  };
  const objects = [
    { x: 3, y: 12, width: 11, height: 15 },
    { x: 26, y: 5, width: 11, height: 22 }
  ];
</script>

<svg
  width="40"
  height="32"
  viewBox="0 0 40 32"
  aria-hidden="true"
  focusable="false"
>
  {#each objects as object}
    <rect
      class="swap-object"
      x={object.x}
      y={object.y}
      width={object.width}
      height={object.height}
      rx="1"
      fill="currentColor"
      fill-opacity="0.08"
      stroke="currentColor"
      stroke-opacity="0.65"
      stroke-width="1.25"
    />
    <rect
      class="reference-mark"
      x={object.x + positions[anchor][0] * object.width - 2}
      y={object.y + positions[anchor][1] * object.height - 2}
      width="4"
      height="4"
      rx="0.5"
      fill="var(--primary, #4ea1ff)"
    />
  {/each}
  <path
    class="swap-arrows"
    d="M17 13h6m-2.5-2.5L23 13l-2.5 2.5M23 21h-6m2.5-2.5L17 21l2.5 2.5"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
  />
</svg>
