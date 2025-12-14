<template>
    <div>
        <!-- Title and "View more" link placeholders -->
        <div class="col-12 mt-3 mb-0">
            <div class="placeholder-glow d-inline-block" style="margin-bottom: 2rem; border-bottom-width: 4px;">
                <span class="placeholder col-12 placeholder-lg rounded-1 bg-secondary opacity-75" style="width: 250px;"></span>
            </div>
            <div class="float-end placeholder-glow">
                <span class="placeholder col-12 rounded-1 bg-secondary opacity-75" style="width: 200px;"></span>
            </div>
        </div>

        <!-- Cards grid -->
        <div class="position-relative mt-0" style="min-height: 250px;">
            <div class="row g-3">
                <div v-for="n in cardCount" :key="n" :class="cardColClass">
                    <LazyCardsPlaceholder />
                </div>
            </div>

            <!-- Pagination placeholder -->
            <div v-if="pagination" class="d-flex justify-content-center mt-4 placeholder-glow">
                <span class="placeholder rounded-circle bg-secondary opacity-75 me-2" style="width: 10px; height: 10px;"></span>
                <span class="placeholder rounded-circle bg-secondary opacity-75 me-2" style="width: 10px; height: 10px;"></span>
                <span class="placeholder rounded-circle bg-secondary opacity-75" style="width: 10px; height: 10px;"></span>
            </div>
        </div>
    </div>
</template>

<script setup>
const props = defineProps({
    cardCount: { type: Number, default: 3 },
    pagination: { type: Boolean, default: false },
    slidePerView: { type: Number, default: 2 }
});

const { cardCount, pagination, slidePerView } = toRefs(props);

// Calculate Bootstrap column classes based on slides per view
const cardColClass = computed(() => {
    const cols = Math.floor(12 / slidePerView.value);
    return `col-12 col-md-${cols}`;
});
</script>

<style scoped>
/* Match the actual component styling */
</style>
