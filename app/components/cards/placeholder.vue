<template>
    <div :id="baseId" class="card card-placeholder placeholder-wave" data-testid="card-placeholder">
        <!-- Image placeholder with wave from parent card -->
        <div :id="`${baseId}-img`" class="card-img-top placeholder bg-secondary opacity-75"></div>
        
        <div :id="`${baseId}-body`" class="card-body d-flex flex-column">
            <!-- Type/category badge placeholder -->
            <div :id="`${baseId}-badge`" class="placeholder-glow mb-2 text-center">
                <span class="placeholder rounded-pill bg-secondary opacity-25 col-6"></span>
            </div>
            
            <!-- Title placeholder (2 lines with glow animation) -->
            <div :id="`${baseId}-title`" class="placeholder-glow mb-2">
                <span class="placeholder col-12 placeholder-lg rounded-1 bg-secondary opacity-75"></span>
                <span class="placeholder col-9 placeholder-lg rounded-1 bg-secondary opacity-75"></span>
            </div>
            
            <!-- Description placeholder (3 lines) -->
            <div :id="`${baseId}-description`" class="placeholder-glow mb-3 flex-grow-1">
                <span class="placeholder col-12 rounded-1"></span>
                <span class="placeholder col-11 rounded-1"></span>
                <span class="placeholder col-8 rounded-1"></span>
            </div>
            
            <!-- Date/metadata placeholder at bottom -->
            <div :id="`${baseId}-footer`" class="placeholder-wave mt-auto text-end">
                <span class="placeholder col-5 placeholder-sm rounded-1 bg-secondary opacity-25"></span>
            </div>
        </div>
    </div>
</template>

<script setup>
const attrs = useAttrs();
const baseId = computed(() => {
    if (attrs?.id) return String(attrs.id);
    return 'card-placeholder';
});
</script>

<style scoped>
.card-placeholder {
    border: 1px solid rgba(0, 0, 0, 0.125);
    height: 600px;
}

@media (max-width: 991px) {
    .card-placeholder {
        height: 700px; /* Match mobile swiper visible card height (~695px with pagination) */
    }
}

.card-img-top {
    width: 100%;
    height: 217px;
    border-top-left-radius: calc(0.375rem - 1px);
    border-top-right-radius: calc(0.375rem - 1px);
}

/* Bootstrap placeholder styles - required for animations to work */
.placeholder{
    display: inline-block;
    min-height: 1em;
    background-color: #e9ecef;
    border-radius: 0.25rem;
}
.placeholder.placeholder-sm{ min-height: 0.8em; }
.placeholder.placeholder-lg{ min-height: 1.4em; }
.placeholder-wave .placeholder{
    position: relative;
    overflow: hidden;
}
.placeholder-wave .placeholder::after{
    content: '';
    position: absolute;
    inset: 0;
    transform: translateX(-100%);
    background: linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,.4) 50%, rgba(255,255,255,0) 100%);
    animation: placeholderWave 1.6s linear infinite;
}
.placeholder-glow .placeholder{
    animation: placeholderGlow 1.4s ease-in-out infinite;
}
@keyframes placeholderWave{
    to{ transform: translateX(100%); }
}
@keyframes placeholderGlow{
    50%{ opacity: .6; }
}
</style>
