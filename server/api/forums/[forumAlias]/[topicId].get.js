
export default defineEventHandler(async (event) => {
        try{
            const query      = getQuery      (event);
            const ctx        = getContext    (event);

            ctx.topicId = getRouterParam(event, 'topicId');

            const topic    = await useDrupalTopics ({event,...ctx,...query });

            topic.comments = await useDrupalForumComments({event,...ctx,...query });

            return topic

        }
        catch (e) {
            passError(event, e);
        }
    }
)
