export default defineEventHandler(async (event) => {
    try{
        const user = await getUser(event);

        return user;
    }
    catch (e) {
        passError(event, e);
    }
})
