// Web: browsers have no secure store, so the session stays in localStorage (FR-AUTH-06 applies to
// native platforms). Undefined during web server-side rendering, where there's no session.
export const authStorage = typeof localStorage === 'undefined' ? undefined : localStorage;
