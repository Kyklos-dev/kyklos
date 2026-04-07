<script setup lang="ts">
import DefaultTheme from "vitepress/theme";
import HeroImage from "./HeroImage.vue";
</script>

<template>
  <DefaultTheme.Layout>
    <template #home-hero-image>
      <HeroImage />
    </template>
  </DefaultTheme.Layout>
</template>
