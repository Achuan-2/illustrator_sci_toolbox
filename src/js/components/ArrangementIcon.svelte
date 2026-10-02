<script lang="ts">
  import type {
    AlignmentMode,
    Direction,
    DistributionMode
  } from '../../shared/host';

  let {
    kind,
    mode
  }: {
    kind: 'align' | 'distribute' | 'spacing';
    mode: AlignmentMode | DistributionMode | Direction;
  } = $props();

  // Filled bars and reference lines follow Illustrator's compact toolbar icons.
  const paths: Record<string, string> = {
    'align.left': 'M3 2h1v20H3z M6 5h9v5H6z M6 14h15v5H6z',
    'align.horizontalCenter': 'M11.5 2h1v20h-1z M7 5h10v5H7z M3 14h18v5H3z',
    'align.right': 'M20 2h1v20h-1z M9 5h9v5H9z M3 14h15v5H3z',
    'align.center': 'M11.5 2h1v20h-1z M2 11.5h20v1H2z M7 7h10v10H7z',
    'align.top': 'M2 3h20v1H2z M5 6h5v15H5z M14 6h5v9h-5z',
    'align.verticalCenter': 'M2 11.5h20v1H2z M5 3h5v18H5z M14 7h5v10h-5z',
    'align.bottom': 'M2 20h20v1H2z M5 3h5v15H5z M14 9h5v9h-5z',
    'distribute.top':
      'M2 3h20v1H2z M2 10h20v1H2z M2 17h20v1H2z M5 4h14v3H5z M8 11h8v3H8z M5 18h14v3H5z',
    'distribute.verticalCenter':
      'M2 5h20v1H2z M2 11.5h20v1H2z M2 18h20v1H2z M5 3h14v5H5z M8 9.5h8v5H8z M5 16h14v5H5z',
    'distribute.bottom':
      'M2 6h20v1H2z M2 13h20v1H2z M2 20h20v1H2z M5 3h14v3H5z M8 10h8v3H8z M5 17h14v3H5z',
    'distribute.left':
      'M3 2h1v20H3z M10 2h1v20h-1z M17 2h1v20h-1z M4 5h3v14H4z M11 8h3v8h-3z M18 5h3v14h-3z',
    'distribute.horizontalCenter':
      'M5 2h1v20H5z M11.5 2h1v20h-1z M18 2h1v20h-1z M3 5h5v14H3z M9.5 8h5v8h-5z M16 5h5v14h-5z',
    'distribute.right':
      'M6 2h1v20H6z M13 2h1v20h-1z M20 2h1v20h-1z M3 5h3v14H3z M10 8h3v8h-3z M17 5h3v14h-3z',
    'spacing.horizontal':
      'M1 3h3v13H1z M7 3h7v13H7z M17 3h6v13h-6z',
    'spacing.vertical':
      'M3 1h13v3H3z M3 7h13v7H3z M3 17h13v6H3z'
  };
  // Dimension marks emphasize equal edge gaps along the varying size axis.
  const gapMarks: Record<string, string> = {
    horizontal: 'M4 18v4M7 18v4M4 20h3M14 18v4M17 18v4M14 20h3',
    vertical: 'M18 4h4M18 7h4M20 4v3M18 14h4M18 17h4M20 14v3'
  };
</script>

<svg
  width="24"
  height="24"
  viewBox="0 0 24 24"
  fill="currentColor"
  aria-hidden="true"
  focusable="false"
>
  <path d={paths[`${kind}.${mode}`]} />
  {#if kind === 'spacing'}
    <path
      d={gapMarks[mode]}
      fill="none"
      stroke="var(--primary, #4ea1ff)"
      stroke-width="1"
    />
  {/if}
</svg>
