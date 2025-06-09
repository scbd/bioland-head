<template>
    <div class="mb-0">
        <!-- Single Status View -->
        <div v-if="statusKey && statusLabel && issues" class="mt-4">
            <div class="d-flex align-items-center mb-3">
                <h4 class="mb-0">{{ t(statusLabel) }}</h4>
                <span class="badge bg-primary ms-2 text-decoration-none">{{ issues?.length || 0 }}</span>
            </div>
            <div class="table-responsive">
                <table class="table table-bordered table-striped align-middle">
                    <thead class="table-light">
                        <tr>
                            <th class="text-center">{{ t('Type') }}</th>
                            <th class="text-center">{{ t('Key') }}</th>
                            <th>{{ t('Summary') }}</th>
                            <th>{{ t('Assignee') }}</th>
                            <th class="text-center">{{ t('Priority') }}</th>
                            <th class="text-center">{{ t('Progress') }}</th>
                            <th class="text-center" style="width: 110px; white-space: nowrap;">
                                <span>Remaining<br>Time Apx.</span>
                            </th>
                            <!-- Removed Created column -->
                        </tr>
                    </thead>
                    <tbody>
                        <template v-for="issue in issues" :key="issue.key">
                            <tr :id="issue.key">
                                <td class="text-nowrap text-center">
                                    <span v-if="issue.fields.issuetype" class="d-inline-flex flex-column align-items-center">
                                        <NuxtImg
                                            v-if="issue.fields.issuetype.iconUrl"
                                            :src="issue.fields.issuetype.iconUrl"
                                            :alt="issue.fields.issuetype.name"
                                            width="24"
                                            height="24"
                                            class="mb-1"
                                            style="vertical-align: middle;"
                                        />
                                        <span>{{ t(issue.fields.issuetype.name) }}</span>
                                    </span>
                                    <span v-else>-</span>
                                </td>
                                <td class="text-nowrap">
                                    <a :href="`https://scbd.atlassian.net/browse/${issue.key}`" target="_blank" rel="noopener">
                                        {{ issue.key }}
                                    </a>
                                </td>
                                <td>
                                    <span v-html="issue.fields.summary"></span>
                                    <div class="text-center">
                                    <span class="text-nowrap" style="cursor:pointer; color:#009edb;" @click="toggleExpanded(issue.key)" v-if="issue.fields.description">
                                            {{t('View More ...')}} <LazyIcon name="read-more" class="ms-1" :size="2.5" color="#009edb" />
                                    </span>
                                    </div>
                                </td>
                                <td class="text-nowrap">
                                    <span v-if="issue.fields.assignee">
                                        <NuxtImg
                                            :src="issue.fields.assignee.avatarUrls?.['24x24']"
                                            :alt="issue.fields.assignee.displayName"
                                            class="rounded-circle me-1 d-inline-block"
                                            width="24"
                                            height="24"
                                            style="vertical-align: middle;"
                                        />
                                        {{ issue.fields.assignee.displayName }}
                                    </span>
                                    <span v-else>{{ t('Unassigned') }}</span>
                                </td>
                                <td class="text-center">
                                    <span v-if="issue.fields.priority" class="d-inline-flex flex-column align-items-center">
                                        <NuxtImg
                                            :src="issue.fields.priority.iconUrl"
                                            :alt="issue.fields.priority.name"
                                            width="32"
                                            height="32"
                                            class="mb-1"
                                            style="vertical-align: middle;"
                                        />
                                        <span>{{ t(issue.fields.priority.name) }}</span>
                                    </span>
                                    <span v-else>-</span>
                                </td>
                                <td class="text-center">
                                    <span v-if="issue.fields.progress && issue.fields.progress.total > 0">
                                        {{
                                            Math.round(
                                                (issue.fields.progress.progress / issue.fields.progress.total) * 100
                                            )
                                        }}%
                                    </span>
                                    <span v-else>-</span>
                                </td>
                                <td class="text-center">
                                    <span v-if="issue.renderedFields?.timetracking?.remainingEstimate">
                                        {{ issue.renderedFields.timetracking.remainingEstimate }}
                                    </span>
                                    <span v-else>-</span>
                                </td>
                                <!-- Removed Created column cell -->
                            </tr>
                            <tr v-if="expandedKey === issue.key">
                                <td
                                    :colspan="7"
                                    class="bg-dark text-white"
                                    v-click-outside="closeExpanded"
                                >
                                    <div
                                        v-if="issue.fields.description"
                                        v-html="issue.fields.description"
                                    ></div>
                                    <div v-else class="text-muted fst-italic">{{ t('No description available') }}</div>
                                </td>
                            </tr>
                        </template>
                    </tbody>
                </table>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref } from 'vue';
defineProps({
    allStatuses: Array, // [{ key, label, issues }]
    issueTypes: Array,  // [ 'Bug', 'Task', ... ]
    statusKey: String,
    statusLabel: String,
    issues: Array
});
const { t } = useI18n();

const expandedKey = ref(null);
function toggleExpanded(key) {
    expandedKey.value = expandedKey.value === key ? null : key;
}
function closeExpanded() {
    expandedKey.value = null;
}


</script>
