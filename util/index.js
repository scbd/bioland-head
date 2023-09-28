
export const getBiolandSiteIdentifier = (hostName) => {
    if(hostName.split('.').length <= 1)
        return undefined;

    return hostName.split('.')[0];
}
