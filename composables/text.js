
function trunc(text, limit=200){
    if(!text) return '';
    return text.slice(0, limit)+ '...';
}

function isTruncated (text, limit=200){
    if(!text) return false;
    return text.length > limit;
}

export const useText = () => ({trunc, isTruncated});