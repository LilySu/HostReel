// The plugin ships no types and exports a factory function via UMD/CJS.
// The factory receives videojs and returns the plugin class registered via
// videojs.registerPlugin.
declare module '@contently/videojs-annotation-comments' {
  const AnnotationCommentsFactory: unknown;
  export default AnnotationCommentsFactory;
}
