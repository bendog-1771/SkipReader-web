import React from 'react';
const paths={
 books:'M4 4h6v16H4z M14 4h5l2 15-5 .7z M4 8h6 M14.5 8l5-.6',
 favorite:'m12 3 2.7 5.6 6.2.9-4.5 4.4 1.1 6.2-5.5-2.9-5.5 2.9 1.1-6.2-4.5-4.4 6.2-.9z',
 words:'M3 18 8 5l5 13 M5 13h6 M16 11c0-4 5-4 5 0v7 M16 15c0-3 5-3 5 0s-5 4-5 0',
 notes:'M5 3h10l4 4v14H5z M14 3v5h5 M8 12h8 M8 16h6'
};
export function LibraryIcon({kind}:{kind:keyof typeof paths}){return <svg aria-hidden="true" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d={paths[kind]}/></svg>;}
