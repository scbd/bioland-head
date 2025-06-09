<template >
    <CookieControl :locale="locale" >
        <template #cookie="{ cookie }">
            <h4>{{t(cookie.name)}}</h4>
            <p>{{ t(cookie.description) }}</p>
           

            <div v-if="cookie.targetCookieIds">
            <b>Cookie ids: </b>
            <span v-text="cookie?.targetCookieIds?.join(', ')" />
            </div>
        </template>
        <template #bar>
            <h2>{{t('cookie-control-title')}}</h2>
            <p>{{t('cookie-control-description')}}</p>
            <NuxtLink  :to="'/'"    >
            {{t('Accept All Cookies')}}
            </NuxtLink> 
            <!-- <n-link>Go somewhere</n-link> -->
        </template>
    </CookieControl>
</template>
<script setup>
const { t, locale } = useI18n();

const {
        cookiesEnabled,
        cookiesEnabledIds,
        isConsentGiven,
        isModalActive,
        moduleOptions,
    } = useCookieControl();

consola.error(moduleOptions)
</script>
<style scoped>

</style>