<template>
    <div class="card nt7-placeholder" style="width: 100%; height: 425px;">
        <div class="card-body d-flex flex-column">
            <!-- Main content area with animated shimmer -->
            <div class="placeholder-content flex-grow-1 mb-3">
                <div class="placeholder-line placeholder-line-dark mb-2" style="width: 90%; height: 16px;"></div>
                <div class="placeholder-line placeholder-line-dark mb-2" style="width: 95%; height: 16px;"></div>
                <div class="placeholder-line placeholder-line-dark mb-2" style="width: 85%; height: 16px;"></div>
                <div class="placeholder-line mb-2" style="width: 92%; height: 16px;"></div>
                <div class="placeholder-line mb-2" style="width: 88%; height: 16px;"></div>
                <div class="placeholder-line mb-2" style="width: 80%; height: 16px;"></div>
            </div>
            
            <!-- Bottom section with badges -->
            <div class="mt-auto d-flex flex-column align-items-center">
                <!-- Number badges -->
                <div class="d-flex gap-2 mb-3 justify-content-center">
                    <div class="placeholder-badge" style="width: 60px; height: 40px; border-radius: 4px;"></div>
                    <div class="placeholder-badge" style="width: 60px; height: 40px; border-radius: 4px;"></div>
                </div>
                
                <!-- Icon badges row -->
                <div class="d-flex gap-2 justify-content-center">
                    <div class="placeholder-icon" style="width: 32px; height: 32px; border-radius: 4px;"></div>
                    <div class="placeholder-icon" style="width: 32px; height: 32px; border-radius: 4px;"></div>
                    <div class="placeholder-icon" style="width: 32px; height: 32px; border-radius: 4px;"></div>
                    <div class="placeholder-icon" style="width: 32px; height: 32px; border-radius: 4px;"></div>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.nt7-placeholder {
    border: 1px solid #e0e0e0;
    background: #fff;
    overflow: hidden;
}

.placeholder-line,
.placeholder-badge,
.placeholder-icon {
    background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
    background-size: 200% 100%;
    animation: shimmer 1.5s infinite;
    border-radius: 4px;
}

.placeholder-line-dark {
    background: linear-gradient(90deg, #d0d0d0 25%, #c0c0c0 50%, #d0d0d0 75%);
    background-size: 200% 100%;
}

.placeholder-badge {
    background: linear-gradient(90deg, #e8e8e8 25%, #d8d8d8 50%, #e8e8e8 75%);
    background-size: 200% 100%;
    animation: shimmer 1.5s infinite;
}

.placeholder-icon {
    background: linear-gradient(90deg, #d0d0d0 25%, #c0c0c0 50%, #d0d0d0 75%);
    background-size: 200% 100%;
    animation: shimmer 1.5s infinite;
}

@keyframes shimmer {
    0% {
        background-position: 200% 0;
    }
    100% {
        background-position: -200% 0;
    }
}
</style>
