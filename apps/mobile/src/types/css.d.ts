// Web-only stylesheets. `expo start` also generates expo-env.d.ts with these, but it's git-ignored,
// so CI's typecheck needs them declared here.
declare module '*.module.css' {
  const classes: Record<string, string>;
  export default classes;
}
declare module '*.css';
