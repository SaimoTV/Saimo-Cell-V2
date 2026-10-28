// Expo Router can decode the percent-encoded fields inside our composite IDs.
// Keep persisted IDs unchanged and resolve route values against known IDs only.
export function resolveDownloadId(
    routeId: string | string[] | undefined,
    storedIds: Iterable<string>,
): string | undefined {
    const value = Array.isArray(routeId) ? routeId[0] : routeId;
    if (!value) return undefined;
    const ids = [...new Set(storedIds)];
    if (ids.includes(value)) return value;
    const matches = ids.filter(id => {
        try { return decodeURIComponent(id) === value; }
        catch { return false; }
    });
    // Never open a different download if a legacy ID is ambiguous.
    return matches.length === 1 ? matches[0] : undefined;
}

// readDirectoryAsync returns decoded filenames, not the encoded IDs used in
// file:// URIs. Ambiguous matches must be retained, never treated as orphans.
export function isKnownDownloadFolder(folder: string, ids: Iterable<string>): boolean {
    for (const id of ids) {
        if (folder === id) return true;
        try {
            if (folder === decodeURIComponent(id).split('/')[0]) return true;
        } catch { /* Keep exact matching for legacy malformed IDs. */ }
    }
    return false;
}
