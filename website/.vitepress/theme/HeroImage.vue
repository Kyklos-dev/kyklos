<script setup lang="ts">
/**
 * Inline SVG (no img src) so the hero always renders on static hosts and stays sharp at any DPR.
 */
</script>

<template>
  <div class="hero-illustration image-src" role="img" aria-label="Pipeline stages: build, test, eval, and kyklos.yaml">
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 480 210"
      width="480"
      height="210"
      fill="none"
      class="hero-svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="hero-panel" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--vp-c-bg-soft)" />
          <stop offset="100%" stop-color="var(--vp-c-bg)" />
        </linearGradient>
      </defs>
      <!-- Card -->
      <rect
        x="12"
        y="24"
        width="456"
        height="162"
        rx="14"
        fill="url(#hero-panel)"
        stroke="var(--vp-c-divider)"
        stroke-width="1.5"
      />
      <!-- Pipeline row -->
      <g class="pipeline" shape-rendering="geometricPrecision">
        <rect x="32" y="48" width="120" height="36" rx="8" fill="var(--vp-c-brand-soft)" stroke="var(--vp-c-brand-2)" stroke-width="2" />
        <text x="92" y="72" text-anchor="middle" fill="var(--vp-c-brand-1)" font-family="system-ui, Segoe UI, sans-serif" font-size="14" font-weight="700">build</text>
        <path d="M160 66h24" stroke="var(--vp-c-divider)" stroke-width="2.5" stroke-linecap="round" />
        <rect x="192" y="48" width="120" height="36" rx="8" fill="var(--vp-c-green-soft)" stroke="var(--vp-c-green-2)" stroke-width="2" />
        <text x="252" y="72" text-anchor="middle" fill="var(--vp-c-green-1)" font-family="system-ui, Segoe UI, sans-serif" font-size="14" font-weight="700">test</text>
        <path d="M320 66h24" stroke="var(--vp-c-divider)" stroke-width="2.5" stroke-linecap="round" />
        <rect x="352" y="48" width="120" height="36" rx="8" fill="var(--vp-c-purple-soft)" stroke="var(--vp-c-purple-2)" stroke-width="2" />
        <text x="412" y="72" text-anchor="middle" fill="var(--vp-c-purple-1)" font-family="system-ui, Segoe UI, sans-serif" font-size="14" font-weight="700">eval</text>
      </g>
      <!-- Config strip -->
      <rect x="32" y="108" width="416" height="44" rx="8" fill="var(--vp-c-bg)" stroke="var(--vp-c-divider)" stroke-width="1.5" />
      <text x="48" y="137" fill="var(--vp-c-text-2)" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="13" font-weight="500">kyklos.yaml</text>
      <circle cx="428" cy="130" r="10" fill="var(--vp-c-text-1)" />
      <text x="428" y="134" text-anchor="middle" fill="var(--vp-c-bg)" font-family="system-ui, sans-serif" font-size="11" font-weight="800">?</text>
    </svg>
  </div>
</template>

<style scoped>
.hero-illustration {
  display: flex;
  align-items: center;
  justify-content: center;
}

.hero-svg {
  width: 100%;
  max-width: 320px;
  height: auto;
  display: block;
  /* Sharp vector text and edges on HiDPI */
  shape-rendering: geometricPrecision;
  text-rendering: geometricPrecision;
}

.dark .hero-svg {
  filter: brightness(1.05) contrast(1.02);
}
</style>
