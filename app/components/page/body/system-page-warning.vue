<template>
    <Transition name="fade">
        <div 
            v-if="showWarning" 
            id="system-page-warning"
            data-testid="system-page-warning"
            class="alert alert-warning alert-dismissible fade show d-flex align-items-start m-3 mt-2" 
            role="alert"
        >
            <Icon name="info" :size="1.5" class="me-3 flex-shrink-0 mt-1" />
            <div class="flex-grow-1">
                <h5 class="alert-heading mb-2">
                    <Icon name="lock" :size="1" class="me-2" />
                    {{ t('systemPageWarningTitle') }}
                </h5>
                <p class="mb-2">{{ t('systemPageWarningMessage') }}</p>
                <hr class="my-2">
                <div class="form-check">
                    <input 
                        id="dont-show-again-checkbox"
                        data-testid="system-page-warning-dont-show-checkbox"
                        v-model="dontShowAgain" 
                        type="checkbox" 
                        class="form-check-input"
                        @change="onDontShowAgainChange"
                    >
                    <label class="form-check-label" for="dont-show-again-checkbox">
                        {{ t('dontShowAgain') }}
                    </label>
                </div>
            </div>
            <button 
                type="button" 
                data-testid="system-page-warning-close-button"
                class="btn-close-custom" 
                :aria-label="t('Close')"
                @click="dismiss"
            >
                <LazyIcon name="close" :size="1.2" />
            </button>
        </div>
    </Transition>
</template>

<script setup>
    const { t }        = useI18n();
    const meStore      = useMeStore();
    const pageStore    = usePageStore();
    const {
        isWarningHidden,
        dontShowAgain,
        sessionDismissed,
        onDontShowAgainChange,
        dismiss
    } = useSystemPageWarning();
    
    // Determine if this is a system page or content type page that user cannot edit
    const isRestrictedPage = computed(() => {
        return pageStore.isSystemPage || pageStore.isContentType;
    });
    
    // User has editing roles (content_manager, contributor, site_manager) but cannot edit system pages
    // These roles see the warning when on system pages
    const isContentManagerLevel = computed(() => {
        return (meStore.isContentManager || meStore.isContributor) && !meStore.canEditSystemPages;
    });
    
    // Main computed: show warning when all conditions met
    const showWarning = computed(() => {
        // Don't show if preference says to hide
        if (isWarningHidden.value) {
            return false;
        }
        
        // Don't show if dismissed this session
        if (sessionDismissed.value) {
            return false;
        }
        
        // Show only for content manager level users (scbd_staff, site_manager, content_manager)
        // who cannot edit system pages, when on a restricted page
        return isContentManagerLevel.value && isRestrictedPage.value;
    });
</script>

<style lang="scss" scoped>
    #system-page-warning {
        border-left: 4px solid #856404;
        background-color: #fff3cd;
        
        .alert-heading {
            color: #856404;
            font-size: 1.1rem;
            font-weight: 600;
        }
        
        p {
            color: #664d03;
            font-size: 0.95rem;
            line-height: 1.5;
        }
        
        .form-check-label {
            color: #664d03;
            font-size: 0.875rem;
        }
        
        hr {
            border-color: rgba(133, 100, 4, 0.2);
        }
        
        .btn-close-custom {
            background: transparent;
            border: none;
            padding: 0.25rem;
            cursor: pointer;
            color: #856404;
            opacity: 0.7;
            
            &:hover {
                opacity: 1;
            }
        }
    }
    
    // Transition animation
    .fade-enter-active,
    .fade-leave-active {
        transition: opacity 0.3s ease, transform 0.3s ease;
    }
    
    .fade-enter-from,
    .fade-leave-to {
        opacity: 0;
        transform: translateY(-10px);
    }
</style>
