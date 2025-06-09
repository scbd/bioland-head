import { camelCase } from 'change-case';
/**
 * Handles an incoming get event to fetch Jira issues based on a specific JQL query.
 * 
 * - Retrieves the Jira token from runtime configuration.
 * - Extracts context and headers from the event.
 * - Calls the Jira REST API to fetch issues matching the query.
 * - Returns an array of issue descriptions.
 * - Handles and passes any errors encountered during the process.
 * 
 * @async
 * @param {import('h3').EventHandlerRequest} event - The incoming event object.
 * @returns {Promise<Array<string>>} A promise that resolves to an array of issue descriptions.
 */

export default defineEventHandler(async (event) => {

        const { jiraToken }   = useRuntimeConfig();
        try{
            const context = getContext(event);
            const headers = { Cookie: getHeader(event, 'Cookie')};

            const issues = await getIssues(context);

            

            return groupIssuesByStatus(issues);
        }
        catch (e) {

            passError(event, e);
        }

        
        /**
         * Fetches Jira issues using the provided context, extracts their descriptions, and returns an array of non-empty descriptions.
         * 
         * @param {object} context - The request context, typically containing user/session info and filters for the Jira query.
         * @returns {Promise<Array<string>>} Promise resolving to an array of issue descriptions.
         */
        async function getIssues(context){
            try{
                const url = 'https://scbd.atlassian.net/rest/api/3/search/jql';
                const options = {
                    method: 'POST',
                    headers: {
                        Authorization: `Basic ${jiraToken}`,
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    body: await makeQuery(context)
                };

                return $fetch(url, options).then(({ issues } ={})=>(issues || []).map(buildDescriptionsMap).filter(Boolean)); //.map(issue => Object.keys(issue.fields))
            }catch(e){
                consola.error('Error fetching issues:', e);
                return [];
            }
        }

        function getIssueParentIds(context){
            try{
                const url = 'https://scbd.atlassian.net/rest/api/3/search/jql';
                const body ={
                jql: 'project = BL AND issuetype = Epic AND labels = "public-view" ORDER BY created DESC',
                fields: ["key"],
                "fieldsByKeys": false,
                maxResults: 200
                }
                const options = {
                    method: 'POST',
                    headers: {
                        Authorization: `Basic ${jiraToken}`,
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    body
                };

                return $fetch(url, options).then(({ issues } ={})=>(issues || []).map(issue => issue.key).filter(Boolean)); //.map(issue => Object.keys(issue.fields))
            }catch(e){
                consola.error('Error fetching issues:', e);
                return [];
            }
        }
        async function makeQuery(context){
            const keys = (await getIssueParentIds(context)).join();

            const query = {
                expand:'renderedFields, attachments',
                jql: `parent IN (${keys}) AND project = BL AND status != "Done" AND status != "Closed" ORDER BY created DESC`,
                //fields: ["*all"],
                fields: ["priority","attachment","progress","description","summary", "labels","issuetype","timetracking", "assignee", "status", "created", "updated"],

                "fieldsByKeys": false,
                maxResults: 200
            };
            return query;
        }

        function buildDescriptionsMap(issue){
            try{
            if(!issue?.fields?.description) { 
                delete issue.fields.description;
                return issue;
            }


            return jiraIssueToHtml(issue)
        }catch(e){
            consola.error('Error building description map:', e);
            return issue;
        }
    }



    // externalCache
})


const jiraIssue = {
    "expand": "renderedFields,names,schema,operations,editmeta,changelog,versionedRepresentations",
    "id": "14633",
    "self": "https://scbd.atlassian.net/rest/api/3/issue/14633",
    "key": "BL-495",
    "renderedFields": {
      "summary": null,
      "issuetype": null,
      "attachment": [],
      "created": "17/Apr/25 3:13 PM",
      "description": "<p>On <a href=\"https://training.bl2.chm-cbd.net/en\" class=\"external-link\" rel=\"nofollow noreferrer\">https://training.bl2.chm-cbd.net/en</a> </p>\n\n\n\n<p>The widget shows the counts of: </p>\n\n<ul>\n\t<li>2371620 (2,371,620) records</li>\n\t<li>1 dataset, and</li>\n\t<li>369 publishers</li>\n</ul>\n\n\n<p>Clicking the actual links gives:</p>\n\n<ul>\n\t<li>2,371,859 records (several hundred more)</li>\n\t<li>1 dataset (same), and</li>\n\t<li>2 publishers (way less)</li>\n</ul>\n\n\n<p>I don’t think it is caching of any sort. At least for publishers</p>",
      "progress": null,
      "assignee": null,
      "updated": "23/Apr/25 9:51 AM",
      "timetracking": {},
      "status": null,
      "labels": null
    },
    "fields": {
      "summary": "GBIF counts seem incorrect",
      "issuetype": {
        "self": "https://scbd.atlassian.net/rest/api/3/issuetype/10004",
        "id": "10004",
        "description": "A problem or error.",
        "iconUrl": "https://scbd.atlassian.net/rest/api/2/universal_avatar/view/type/issuetype/avatar/10303?size=medium",
        "name": "Bug",
        "subtask": false,
        "avatarId": 10303,
        "hierarchyLevel": 0
      },
      "attachment": [],
      "created": "2025-04-17T15:13:59.271-0400",
      "description": "<p>On <a href=\"https://training.bl2.chm-cbd.net/en\" rel=\"nofollow noreferrer noopener\" target=\"_blank\">https://training.bl2.chm-cbd.net/en</a> </p><p>&nbsp;</p><p>The widget shows the counts of: </p><ul><li><p>2371620 (2,371,620) records</p></li><li><p>1 dataset, and </p></li><li><p>369 publishers</p></li></ul><p>Clicking the actual links gives:</p><ul><li><p>2,371,859 records (several hundred more)</p></li><li><p>1 dataset (same), and</p></li><li><p>2 publishers (way less)</p></li></ul><p>I don’t think it is caching of any sort. At least for publishers</p>",
      "progress": {
        "progress": 0,
        "total": 0
      },
      "assignee": {
        "self": "https://scbd.atlassian.net/rest/api/3/user?accountId=557058%3A49e8dd74-f746-4e4d-9960-26556a747a93",
        "accountId": "557058:49e8dd74-f746-4e4d-9960-26556a747a93",
        "emailAddress": "randy.houlahan@un.org",
        "avatarUrls": {
          "48x48": "https://secure.gravatar.com/avatar/65e74afcf7c74f1bd60ea079a6260b1b?d=https%3A%2F%2Favatar-management--avatars.us-west-2.prod.public.atl-paas.net%2Finitials%2FRH-2.png",
          "24x24": "https://secure.gravatar.com/avatar/65e74afcf7c74f1bd60ea079a6260b1b?d=https%3A%2F%2Favatar-management--avatars.us-west-2.prod.public.atl-paas.net%2Finitials%2FRH-2.png",
          "16x16": "https://secure.gravatar.com/avatar/65e74afcf7c74f1bd60ea079a6260b1b?d=https%3A%2F%2Favatar-management--avatars.us-west-2.prod.public.atl-paas.net%2Finitials%2FRH-2.png",
          "32x32": "https://secure.gravatar.com/avatar/65e74afcf7c74f1bd60ea079a6260b1b?d=https%3A%2F%2Favatar-management--avatars.us-west-2.prod.public.atl-paas.net%2Finitials%2FRH-2.png"
        },
        "displayName": "Randy Houlahan",
        "active": true,
        "timeZone": "America/Toronto",
        "accountType": "atlassian"
      },
      "updated": "2025-04-23T09:51:16.573-0400",
      "timetracking": {},
      "status": {
        "self": "https://scbd.atlassian.net/rest/api/3/status/10038",
        "description": "This was auto-generated by Jira Service Management during workflow import",
        "iconUrl": "https://scbd.atlassian.net/images/icons/status_generic.gif",
        "name": "Draft",
        "id": "10038",
        "statusCategory": {
          "self": "https://scbd.atlassian.net/rest/api/3/statuscategory/2",
          "id": 2,
          "key": "new",
          "colorName": "blue-gray",
          "name": "To Do"
        }
      },
      "labels": []
    }
  }


/**
 * Groups Jira issues by their status name (camelCase), sorting each group by priority, progress, and created date.
 * @param {Array<object>} issues - Array of Jira issue objects.
 * @returns {object} Map of statusNameCamelCase => sorted array of issues.
 */
function groupIssuesByStatus(issues) {

    if (!Array.isArray(issues)) return {};

    // Helper to convert status name to camelCase
    function toCamelCase(str) {
        return str
            .replace(/[^a-zA-Z0-9 ]/g, ' ')
            .replace(/(?:^\w|[A-Z]|\b\w)/g, (word, index) =>
                index === 0 ? word.toLowerCase() : word.toUpperCase()
            )
            .replace(/\s+/g, '');
    }

    // Helper to get priority value (higher = more important)
    function getPriority(issue) {
        // Try to get from issue.fields.priority.priority or issue.fields.priority.name
        const priority = issue?.fields?.priority;
        if (!priority) return 0;
        if (typeof priority.priority === 'number') return priority.priority;
        // Map common Jira priorities to numbers (customize as needed)
        const priorityMap = {
            highest: 5,
            high: 4,
            medium: 3,
            low: 2,
            lowest: 1
        };
        if (typeof priority.name === 'string') {
            return priorityMap[priority.name.toLowerCase()] || 0;
        }
        return 0;
    }

    // Helper to get progress percent (higher = more complete)
    function getProgress(issue) {
        const progress = issue?.fields?.progress;
        if (progress && typeof progress.progress === 'number' && typeof progress.total === 'number' && progress.total > 0) {
            return progress.progress / progress.total;
        }
        return 0;
    }

    // Helper to get created date as timestamp
    function getCreated(issue) {
        const created = issue?.fields?.created;
        if (!created) return 0;
        return new Date(created).getTime() || 0;
    }

    // Group issues by camelCase status name, merging "Reopened" into "In Progress"
    const grouped = {};
    for (const issue of issues) {
        let statusName = issue?.fields?.status?.name || 'Unknown';
        // Treat "Reopened" as "In Progress"
        if (statusName.toLowerCase() === 'reopened') statusName = 'In Progress';
        const key = camelCase(statusName);
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(issue);
    }

    // Sort each group by priority DESC, then progress DESC, then created DESC
    for (const key in grouped) {
        grouped[key].sort((a, b) => {
            const pa = getPriority(a), pb = getPriority(b);
            if (pb !== pa) return pb - pa;
            const progA = getProgress(a), progB = getProgress(b);
            if (progB !== progA) return progB - progA;
            const ca = getCreated(a), cb = getCreated(b);
            return cb - ca;
        });
    }

    return grouped;
}