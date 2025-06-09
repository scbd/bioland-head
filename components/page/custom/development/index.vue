<template>
    <div class="container page-body">
        <div class="row">
         
            <div class="col-12">
                <LazyPageBreadCrumbs/>
            </div>

            <div class="col-12">
                <LazyPageBodyTabs />
                <h2 class="data-body mb-0" :class="{'has-hero': pageStore?.heroImage}" >{{ pageStore?.title}}</h2>
                <hr class="mt-1" />



    <!-- Development Cycle Explanation -->
     <div class="container">
    <div class="mb-4">
        <p>
            <NuxtLink :to="'#status-draft'" style="color:inherit;text-decoration:underline;">
                <b>{{ t('Requests') }}</b>
            </NuxtLink>
            ({{ t('ideas or needs are submitted') }}),
            <NuxtLink :to="'#status-inReview'" style="color:inherit;text-decoration:underline;">
                <b>{{ t('Under Review') }}</b>
            </NuxtLink>
            ({{ t('requests are reviewed for correctness, correct issue type, or if they will be selected for development') }}),
            <NuxtLink :to="'#status-selectedForDevelopment'" style="color:inherit;text-decoration:underline;">
                <b>{{ t('Selected') }}</b>
            </NuxtLink>
            ({{ t('tasks are prioritized for work') }}),
            <NuxtLink :to="'#status-inProgress'" style="color:inherit;text-decoration:underline;">
                <b>{{ t('In Progress') }}</b>
            </NuxtLink>
            ({{ t('work is being done') }}),
            {{ t('and') }}
            <NuxtLink :to="'#status-readyForTesting'" style="color:inherit;text-decoration:underline;">
                <b>{{ t('Testing') }}</b>
            </NuxtLink>
            ({{ t('final checks before release') }}).
            {{ t('Sometimes, issues may return from') }}
            <NuxtLink :to="'#status-readyForTesting'" style="color:inherit;text-decoration:underline;">
                <b>{{ t('Testing') }}</b>
            </NuxtLink>
            {{ t('or') }}
            <NuxtLink :to="'#status-inProgress'" style="color:inherit;text-decoration:underline;">
                <b>{{ t('In Progress') }}</b>
            </NuxtLink>
            {{ t('back to') }}
            <NuxtLink :to="'#status-selectedForDevelopment'" style="color:inherit;text-decoration:underline;">
                <b>{{ t('Selected') }}</b>
            </NuxtLink>
            {{ t('or') }}
            <NuxtLink :to="'#status-inReview'" style="color:inherit;text-decoration:underline;">
                <b>{{ t('Under Review') }}</b>
            </NuxtLink>
            {{ t('if more work is needed') }}.
        </p>
        <div class="d-flex justify-content-center text-center">
            <svg
                viewBox="0 0 800 90"
                width="100%"
                height="90"
                preserveAspectRatio="xMinYMin meet"
                xmlns="http://www.w3.org/2000/svg"
                style="max-width: 100%; height: auto;"
            >
                <defs>
                    <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
                        <polygon points="0 0, 10 3.5, 0 7" fill="#333"/>
                    </marker>
                </defs>
                <g transform="translate(48,0)">
                    <rect x="20" y="30" width="90" height="30" rx="10" class="step"/>
                    <foreignObject x="20" y="30" width="90" height="30">
                      <div xmlns="http://www.w3.org/1999/xhtml" style="display:flex;align-items:center;justify-content:center;height:30px;width:90px;">
                        <NuxtLink :to="'#status-draft'" style="color:#fff;text-decoration:none;">
                          <span style="font-weight:bold;font-size:13px;text-align:center;word-break:break-word;line-height:1.1;">
                            {{ t('Requests') }}
                          </span>
                        </NuxtLink>
                      </div>
                    </foreignObject>
                    <rect x="170" y="30" width="90" height="30" rx="10" class="step"/>
                    <foreignObject x="170" y="30" width="90" height="30">
                      <div xmlns="http://www.w3.org/1999/xhtml" style="display:flex;align-items:center;justify-content:center;height:30px;width:90px;">
                        <NuxtLink :to="'#status-inReview'" style="color:#fff;text-decoration:none;">
                          <span style="font-weight:bold;font-size:13px;text-align:center;word-break:break-word;line-height:1.1;">
                            {{ t('Under Review') }}
                          </span>
                        </NuxtLink>
                      </div>
                    </foreignObject>
                    <rect x="320" y="30" width="90" height="30" rx="10" class="step"/>
                    <foreignObject x="320" y="30" width="90" height="30">
                      <div xmlns="http://www.w3.org/1999/xhtml" style="display:flex;align-items:center;justify-content:center;height:30px;width:90px;">
                        <NuxtLink :to="'#status-selectedForDevelopment'" style="color:#fff;text-decoration:none;">
                          <span style="font-weight:bold;font-size:13px;text-align:center;word-break:break-word;line-height:1.1;">
                            {{ t('Selected') }}
                          </span>
                        </NuxtLink>
                      </div>
                    </foreignObject>
                    <rect x="470" y="30" width="90" height="30" rx="10" class="step"/>
                    <foreignObject x="470" y="30" width="90" height="30">
                      <div xmlns="http://www.w3.org/1999/xhtml" style="display:flex;align-items:center;justify-content:center;height:30px;width:90px;">
                        <NuxtLink :to="'#status-inProgress'" style="color:#fff;text-decoration:none;">
                          <span style="font-weight:bold;font-size:13px;text-align:center;word-break:break-word;line-height:1.1;">
                            {{ t('In Progress') }}
                          </span>
                        </NuxtLink>
                      </div>
                    </foreignObject>
                    <rect x="620" y="30" width="90" height="30" rx="10" class="step"/>
                    <foreignObject x="620" y="30" width="90" height="30">
                      <div xmlns="http://www.w3.org/1999/xhtml" style="display:flex;align-items:center;justify-content:center;height:30px;width:90px;">
                        <NuxtLink :to="'#status-readyForTesting'" style="color:#fff;text-decoration:none;">
                          <span style="font-weight:bold;font-size:13px;text-align:center;word-break:break-word;line-height:1.1;">
                            {{ t('Testing') }}
                          </span>
                        </NuxtLink>
                      </div>
                    </foreignObject>
                    <!-- Forward arrows, lengthened by 75% -->
                    <line x1="110" y1="45" x2="170" y2="45" class="arrow"/>
                    <line x1="260" y1="45" x2="320" y2="45" class="arrow"/>
                    <line x1="410" y1="45" x2="470" y2="45" class="arrow"/>
                    <line x1="560" y1="45" x2="620" y2="45" class="arrow"/>
                </g>
            </svg>
        </div>
    </div>
    </div>

        <!-- Summary Table -->
        <div class="d-flex align-items-center mb-3">
                <h4 class="mb-0">{{ t('Work Overview') }}</h4>
                <span class="badge bg-primary ms-2 text-decoration-none">{{ allIssuesCount || 0 }}</span>
        </div>
        <div class="table-responsive mb-2">
            <table class="table table-bordered table-striped align-middle">
                <thead class="table-light">
                    <tr>
                        <th></th>
                        <th v-for="type in issueTypes" :key="type" class="text-center">
                            <div class="d-flex flex-column align-items-center">
                                <NuxtImg
                                    v-if="issueTypeIcons[type]"
                                    :src="issueTypeIcons[type]"
                                    :alt="type"
                                    width="24"
                                    height="24"
                                    class="mb-1"
                                    style="vertical-align: middle;"
                                />
                                <span>{{ t(type) }}</span>
                            </div>
                        </th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="status in allStatuses" :key="status.key">
                        <th class="text-nowrap">
                            <a :href="'#status-' + status.key">{{ t(status.label) }}</a>
                        </th>
                        <td v-for="type in issueTypes" :key="type" class="text-center">
                            {{
                                status.issues
                                    ? status.issues.filter(issue => issue.fields.issuetype?.name === type).length
                                    : 0
                            }}
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>

 
                <!-- Jira Status Tables -->
                <div v-if="statusMap">
                    <PageCustomDevelopmentStatusTable 
                        v-for="statusKey in orderedStatusKeys"
                        :key="statusKey"
                        :status-key="statusKey"
                        :issues="statusMap[statusKey]"
                        :status-label="statusLabels[statusKey]"
                    />
             
                </div>
                <div v-else>
                    <div class="alert alert-info">Loading Jira issues...</div>
                  
                </div>

            </div>
        </div>
    </div>


</template>

<script setup>

const {t} = useI18n();
const pageStore = usePageStore();
const { pageTypeStyle } = useTheme();
const   getCachedData  = useGetCachedData();

const { data, status, error } =  await useLazyFetch(`/api/jira`, {  method: 'GET',key: 'chm-network-widget', getCachedData });

// Map status keys to display labels
const statusLabels = {
    readyForTesting: 'Testing',
    inProgress: 'In Progress',
    selectedForDevelopment: 'Selected For Development',
    inReview: 'Under Review',
    draft: 'Requests'
};

// The order in which to display the statuses
const orderedStatusKeys = [
    'readyForTesting',
    'inProgress',
    'selectedForDevelopment',
    'inReview',
    'draft'
];

// Compute the grouped status map from the API data
const statusMap = computed(() => {
    if (!data.value || typeof data.value !== 'object') return null;
    // Only include statuses that exist in the data and are in the ordered list
    const map = {};
    for (const key of orderedStatusKeys) {
        if (data.value[key] && Array.isArray(data.value[key]) && data.value[key].length > 0) {
            map[key] = data.value[key];
        }
    }
    return Object.keys(map).length ? map : null;
});

// Compute allStatuses for the Status Table
const allStatuses = computed(() => {
    if (!data.value || typeof data.value !== 'object') return [];
    return orderedStatusKeys
        .filter(key => Array.isArray(data.value[key]) && data.value[key].length > 0)
        .map(key => ({
            key,
            label: statusLabels[key] || key,
            issues: data.value[key]
        }));
});

// Compute unique issue types for the summary table
const issueTypes = computed(() => {
    if (!data.value || typeof data.value !== 'object') return [];
    const typesSet = new Set();
    orderedStatusKeys.forEach(key => {
        const issues = data.value[key];
        if (Array.isArray(issues)) {
            issues.forEach(issue => {
                const type = issue?.fields?.issuetype?.name;
                if (type) typesSet.add(type);
            });
        }
    });
    return Array.from(typesSet);
});

// Map issue type name to its iconUrl (first found in data)
const issueTypeIcons = computed(() => {
    const icons = {};
    if (!data.value || typeof data.value !== 'object') return icons;
    orderedStatusKeys.forEach(key => {
        const issues = data.value[key];
        if (Array.isArray(issues)) {
            issues.forEach(issue => {
                const type = issue?.fields?.issuetype?.name;
                const iconUrl = issue?.fields?.issuetype?.iconUrl;
                if (type && iconUrl && !icons[type]) {
                    icons[type] = iconUrl;
                }
            });
        }
    });
    return icons;
});

// Compute the total number of all issues
const allIssuesCount = computed(() => {
    if (!data.value || typeof data.value !== 'object') return 0;
    return orderedStatusKeys.reduce((sum, key) => {
        const issues = data.value[key];
        return sum + (Array.isArray(issues) ? issues.length : 0);
    }, 0);
});
</script>

<style lang="scss" scoped>
//    body {
//             font-family: 'Roboto', sans-serif; /* Default body font */
//             font-weight: 400;
//             background-color: #f8f9fa;
//             color: #343a40;
//             line-height: 1.7;
//             padding-top: 2rem; 
//             padding-bottom: 2rem; 
//         }

        /* Headings will use Lato */
        .card-header {
            font-family: 'Lato', sans-serif;
            font-weight: 700; /* Default bold for headings */
        }

        .content-section {
            padding: 0;
        }

        .info-card {
            background-color: #ffffff;
            border-radius: 12px;
            box-shadow: 0 10px 25px rgba(0, 0, 0, 0.08);
            margin-bottom: 2.5rem;
            border: 1px solid #e9ecef;
            transition: transform 0.3s ease-in-out, box-shadow 0.3s ease-in-out;
        }

        .info-card:hover {
            transform: translateY(-5px);
            box-shadow: 0 15px 30px rgba(0, 0, 0, 0.12);
        }

        .info-card .card-header {
            background-color: var(--bs-primary);
            color: white;
            font-weight: 700; /* Lato bold for card headers */
            border-top-left-radius: 12px;
            border-top-right-radius: 12px;
            padding: 1.25rem 1.75rem;
            font-size: 1.4rem; /* Adjusted for Lato */
            display: flex;
            align-items: center;
        }
        
        .info-card .card-header svg {
            width: 1.6rem; 
            height: 1.6rem; 
            margin-right: 0.75rem;
            fill: currentColor; 
        }

        .info-card .card-body {
            padding: 2.5rem;
        }

        .details-list dt {
            font-family: 'Roboto', sans-serif; /* Roboto for definition terms */
            font-weight: 500; /* Medium weight for terms */
            color: var(--bs-primary);
            margin-bottom: 0.3rem;
            display: flex; 
            align-items: center;
        }
        .details-list dd {
            font-family: 'Roboto', sans-serif; /* Roboto for definition descriptions */
            margin-bottom: 1rem;
            color: #495057;
            padding-left: 2.1rem; 
        }
        .details-list dt svg { 
            width: 1.1rem;
            height: 1.1rem;
            margin-right: 0.6rem;
            fill: var(--bs-primary); 
        }

        .main-text h3 { /* Section titles within the main text card */
            font-family: 'Lato', sans-serif; /* Lato for these subheadings */
            font-weight: 700; /* Bold Lato */
            color: var(--bs-primary);
            margin-top: 2rem;
            margin-bottom: 1rem;
            font-size: 1.75rem; /* Adjusted for Lato */
            border-bottom: 2px solid var(--bs-primary);
            padding-bottom: 0.5rem;
        }
         .main-text h3:first-child {
            margin-top: 0;
        }

        .main-text p {
            font-family: 'Roboto', sans-serif; /* Roboto for paragraphs */
            margin-bottom: 1.25rem;
            color: #495057;
        }

        .gallery-placeholder img {
            border-radius: 8px;
            box-shadow: 0 4px 8px rgba(0,0,0,0.1);
        }

        .btn { /* Ensure buttons also use a consistent font if needed */
            font-family: 'Roboto', sans-serif;
            font-weight: 500;
        }

.label { font: bold 14px sans-serif; }
.step { fill: #009edb; stroke: #005f7f; stroke-width: 2; }
.arrow { stroke: #333; stroke-width: 2; marker-end: url('#arrowhead');}
.back { stroke: #f39c12; stroke-dasharray: 4 2; marker-end: url(#arrowhead);}
/* Extracted and consolidated styles */
.nav-link {
    color: black;
}
.nav-link:hover {
    color: black;
    background-color: grey;
}
.a {
    z-index: 2;
    color: white;
    text-decoration: none;
    background-color: #009edb;
    border-color: white;
    border-bottom: #009edb solid 1px;
}
.dropdown-menu {
    background-color: white;
}
.tabs {
    width: 100%;
}
.page-body {
    min-height: 60vh;
}
.data-body {
    padding-left: 0;
    border-top: black .5rem solid;
    padding-top: 1rem;
}
.has-hero {
    font-size: 1.2rem;
}
.page-type {
    padding-left: 0;
    padding-top: 1rem;
    border-top: var(--bs-primary) .5rem solid;
    font-size: 2rem;
    color: var(--bs-primary);
}
.side-heading {
    padding-left: 0;
    padding-top: 1rem;
    border-top: var(--bs-primary) .5rem solid;
    font-size: 2rem;
}

/* Styles for the SVG diagram and explanation */
.dev-cycle-explanation {
    margin-bottom: 1.5rem;
}
.dev-cycle-explanation p {
    margin-bottom: 1rem;
}
.dev-cycle-svg {
    display: flex;
    justify-content: center;
}
.dev-cycle-svg svg .label {
    font: bold 14px sans-serif;
}
.dev-cycle-svg svg .step {
    fill: #009edb;
    stroke: #005f7f;
    stroke-width: 2;
}
.dev-cycle-svg svg .arrow {
    stroke: #333;
    stroke-width: 2;
    marker-end: url(#arrowhead);
}
.dev-cycle-svg svg .back {
    stroke: #f39c12;
    stroke-dasharray: 4 2;
    marker-end: url(#arrowhead);
}
</style>