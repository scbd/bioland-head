export default defineEventHandler(async (event) => {

    const token = await getToken(event);

    event.context.token = token;
});


