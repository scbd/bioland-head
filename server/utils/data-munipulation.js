
import isNill        from 'lodash.isnil'         ;
import clone from 'lodash.clonedeep';

export function removeNullPropsFromPlainObject(obj){
    for (const key in obj)
        if(isNill(obj[key])) delete obj[key];

    return obj;
}

export function shuffleArrayHourly(array) {
    const clonedArray = clone(array);
    const hourSeed = Math.floor(Date.now() / (1000 * 60 * 60)); // Current hour as seed
    let currentIndex = clonedArray.length, randomIndex;

    while (currentIndex !== 0) {
        randomIndex = hourSeed % currentIndex; // Deterministic random index based on hour
        currentIndex--;

        // Swap elements
        [clonedArray[currentIndex], clonedArray[randomIndex]] = [clonedArray[randomIndex], clonedArray[currentIndex]];
    }

    return clonedArray;
}

export function limitArrayToX(array, x = 20) {
    return array.length > x ? array.slice(0, x) : array;
}

export function sortNT7byToc(a, b){
    const tocA = extractTOCValue(a.title);
    const tocB = extractTOCValue(b.title);

    // Helper to split TOC values into comparable arrays
    function parseTOC(val) {
        if (!val) return [];
        return val.split('.').map(part => {
            // Try to parse as number, fallback to lowercase string
            const num = Number(part);
            return isNaN(num) ? part.toLowerCase() : num;
        });
    }

    const arrA = parseTOC(tocA);
    const arrB = parseTOC(tocB);

    // Compare arrays element by element
    for (let i = 0; i < Math.max(arrA.length, arrB.length); i++) {
        if (arrA[i] === undefined) return -1;
        if (arrB[i] === undefined) return 1;
        if (arrA[i] < arrB[i]) return -1;
        if (arrA[i] > arrB[i]) return 1;
    }

    // If TOC values are equal or both null, sort by updatedDate
    return new Date(b.updatedDate) - new Date(a.updatedDate);
}

export { parseJson, uniqueArrayOfObjects, uniqueArray, sortArrayOfObjectsByProp } from '~/utils/index';

function extractTOCValue(title) {
    // Matches patterns like 15, 14.2, 4.f, 2.4.3 but not 4-digit years
    const match = title.match(/\b(?!\d{4}\b)(\d+(?:\.\d+|[a-z])?(?:\.\d+|[a-z])*)\b/i);
    return match ? match[1] : null;
}