import { mergeQueryIntoContext } from '../../../utils/merge-query-into-context';
export default defineEventHandler(async (event) => {
        try{
            const query      = getQuery      (event);
            const ctx        = await useRequestContext(event);

            ctx.topicId = getRouterParam(event, 'topicId');

            const topic    = await useDrupalTopics ({ ...mergeQueryIntoContext(ctx, query), event });

            topic.comments = await useDrupalForumComments({ ...mergeQueryIntoContext(ctx, query), event });

            return topic

        }
        catch (e) {
            passError(event, e);
        }
    }
)
